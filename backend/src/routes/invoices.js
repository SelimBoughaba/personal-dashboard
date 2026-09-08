import { Router } from "express";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { scanForInvoices, parseGermanAmount } from "../invoiceScanner.js";
import { INVOICE_STATUSES as STATUSES } from "../constants.js";
import { toCsv, parseCsv } from "../csv.js";
import { recordBackgroundEvent, recordIntegrationError } from "../notifications.js";
import { todayIso } from "../recurrence.js";

export const invoicesRouter = Router();

invoicesRouter.get("/", (req, res) => {
  const { area, status } = req.query;
  let query = "SELECT * FROM invoices";
  const clauses = ["deleted_at IS NULL"];
  const params = [];

  if (area && area !== "alle") {
    clauses.push("area = ?");
    params.push(area);
  }
  if (status && status !== "alle") {
    clauses.push("status = ?");
    params.push(status);
  }
  if (clauses.length) query += " WHERE " + clauses.join(" AND ");
  query += " ORDER BY due_date IS NULL, due_date ASC, received_at DESC";

  res.json(db.prepare(query).all(...params));
});

invoicesRouter.post("/scan", async (req, res) => {
  try {
    const created = await scanForInvoices();
    // Ein Ereignis pro Kalendertag statt pro Klick (Punkt 76:
    // "deduplizieren") - mehrere Scans am selben Tag aktualisieren nur den
    // Zähler des bestehenden Ereignisses. Nur bei tatsächlichen Neufunden,
    // damit ein "0 neue" Scan nicht die Liste mit Nichts-Meldungen füllt.
    if (created.length > 0) {
      recordBackgroundEvent(
        `background:mailscan:${todayIso()}`,
        `${created.length} neue Rechnungsvorschläge`,
        "Aus dem Mail-Scan, noch ungeprüft.",
      );
    }
    res.json({ new: created.length });
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") {
      return res.status(503).json({
        error: "Mail ist nicht konfiguriert. In den Einstellungen unter „E-Mail“ ein Postfach hinzufügen.",
      });
    }
    console.error("Rechnungs-Scan-Fehler:", err);
    recordIntegrationError("error:mail", "Mail-Verbindung fehlgeschlagen", "IMAP-Zugangsdaten/Host prüfen.");
    res.status(502).json({
      error: "Postfach konnte nicht durchsucht werden. IMAP-Zugangsdaten/Host prüfen.",
    });
  }
});

function validateInvoiceInput(body) {
  const errors = [];
  if (body.area !== undefined && !isValidArea(body.area)) errors.push("Ungültiger Bereich.");
  if (body.status !== undefined && !STATUSES.includes(body.status)) errors.push("Ungültiger Status.");
  if (body.amount !== undefined && body.amount !== null && body.amount !== "" && !Number.isFinite(Number(body.amount))) {
    // Number.isNaN(Number("Infinity")) ist false - !isNaN allein würde
    // "Infinity"/"-Infinity" durchlassen und als Betrag in einer REAL-
    // Spalte landen lassen. isFinite() lehnt beides zusätzlich ab.
    errors.push("Ungültiger Betrag.");
  }
  return errors;
}

// source wird nie aus dem Request übernommen (nur intern beim Scan
// gesetzt, siehe invoiceScanner.js) - eine Rechnung kann aber jederzeit
// als geprüft markiert werden, unabhängig davon, woher sie stammt.
function confirmedValue(body, fallback) {
  return body.confirmed !== undefined ? !!body.confirmed : fallback;
}

invoicesRouter.post("/", (req, res) => {
  const body = req.body || {};
  const errors = validateInvoiceInput(body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const confirmed = confirmedValue(body, true);
  const status = body.status || "offen";

  const stmt = db.prepare(`
    INSERT INTO invoices (sender, sender_name, subject, amount, due_date, area, status, source, confirmed, confirmed_at, paid_at)
    VALUES (@sender, @sender_name, @subject, @amount, @due_date, @area, @status, 'manuell', @confirmed, @confirmed_at, @paid_at)
  `);
  const info = stmt.run({
    sender: body.sender || "",
    sender_name: body.sender_name || "",
    subject: body.subject || "",
    amount: body.amount === "" || body.amount === undefined ? null : Number(body.amount),
    due_date: body.due_date || null,
    area: body.area || getDefaultAreaId(),
    status,
    confirmed: confirmed ? 1 : 0,
    // Belegte Ereignisfolge (Punkt 57): manuell angelegt und sofort bestätigt/
    // bezahlt heißt, dieser Schritt ist JETZT tatsächlich geschehen - kein
    // erfundenes rückwirkendes Datum wie bei der Migration für Bestandsdaten.
    confirmed_at: confirmed ? new Date().toISOString() : null,
    paid_at: status === "bezahlt" ? new Date().toISOString() : null,
  });

  res.status(201).json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(info.lastInsertRowid));
});

invoicesRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Rechnung nicht gefunden." });

  const body = req.body || {};
  const errors = validateInvoiceInput(body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const confirmed = confirmedValue(body, !!existing.confirmed);
  const status = body.status ?? existing.status;

  // Belegte Ereignisfolge (Punkt 57): confirmed_at/paid_at werden genau bei
  // einem tatsächlichen Übergang gesetzt (sticky - ein erneutes Speichern
  // einer bereits bestätigten Rechnung überschreibt den ursprünglichen
  // Zeitpunkt nicht) und beim Rückgängigmachen wieder gelöscht, statt einen
  // inzwischen falschen Zeitpunkt stehen zu lassen ("nur tatsächlich
  // gespeicherte Schritte zeigen" gilt auch für einen widerrufenen Schritt).
  const confirmed_at = confirmed ? existing.confirmed_at || new Date().toISOString() : null;
  const paid_at = status === "bezahlt" ? existing.paid_at || new Date().toISOString() : null;

  const merged = {
    id: req.params.id,
    sender: body.sender ?? existing.sender,
    sender_name: body.sender_name ?? existing.sender_name,
    subject: body.subject ?? existing.subject,
    amount:
      body.amount === undefined ? existing.amount : body.amount === "" || body.amount === null ? null : Number(body.amount),
    due_date: body.due_date === undefined ? existing.due_date : body.due_date || null,
    area: body.area ?? existing.area,
    status,
    confirmed: confirmed ? 1 : 0,
    confirmed_at,
    paid_at,
  };

  db.prepare(`
    UPDATE invoices SET sender=@sender, sender_name=@sender_name, subject=@subject,
      amount=@amount, due_date=@due_date, area=@area, status=@status, confirmed=@confirmed,
      confirmed_at=@confirmed_at, paid_at=@paid_at, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id));
});

invoicesRouter.delete("/:id", (req, res) => {
  // Papierkorb (Punkt 77): Soft-Delete statt echtem DELETE, siehe trash.js.
  const info = db
    .prepare("UPDATE invoices SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Rechnung nicht gefunden." });
  res.status(204).send();
});

const CSV_HEADERS = ["Absender", "Betreff", "Betrag", "Faelligkeitsdatum", "Bereich", "Status"];

invoicesRouter.get("/export.csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM invoices WHERE deleted_at IS NULL ORDER BY due_date IS NULL, due_date ASC").all();
  const csv = toCsv(
    CSV_HEADERS,
    rows.map((r) => [
      r.sender_name || r.sender || "",
      r.subject || "",
      r.amount !== null ? String(r.amount).replace(".", ",") : "",
      r.due_date || "",
      r.area,
      r.status,
    ]),
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="rechnungen-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + csv); // BOM, damit Excel Umlaute korrekt erkennt
});

invoicesRouter.post("/import", (req, res) => {
  const { csv } = req.body || {};
  if (!csv || typeof csv !== "string") {
    return res.status(400).json({ error: "Kein CSV-Inhalt übermittelt." });
  }

  let rows;
  try {
    rows = parseCsv(csv.replace(/^﻿/, ""));
  } catch (err) {
    return res.status(400).json({ error: `CSV-Datei ist fehlerhaft: ${err.message}` });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: "Datei ist leer." });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const idx = {
    sender: col("absender"),
    subject: col("betreff"),
    amount: col("betrag"),
    due: col("faelligkeitsdatum"),
    area: col("bereich"),
    status: col("status"),
  };
  if (idx.sender === -1 && idx.subject === -1) {
    return res.status(400).json({
      error: "Erwartete Spalten nicht gefunden. Kopfzeile muss u. a. 'Absender' und/oder 'Betreff' enthalten.",
    });
  }

  const dataRows = rows.slice(1);
  const skipped = [];
  let imported = 0;

  const insert = db.prepare(`
    INSERT INTO invoices (sender_name, subject, amount, due_date, area, status)
    VALUES (@sender_name, @subject, @amount, @due_date, @area, @status)
  `);

  const run = db.transaction(() => {
    dataRows.forEach((cols, rowIndex) => {
      const senderName = idx.sender >= 0 ? (cols[idx.sender] || "").trim() : "";
      const subject = idx.subject >= 0 ? (cols[idx.subject] || "").trim() : "";
      if (!senderName && !subject) {
        skipped.push({ row: rowIndex + 2, reason: "Weder Absender noch Betreff angegeben." });
        return;
      }

      const amountRaw = idx.amount >= 0 ? (cols[idx.amount] || "").trim() : "";
      const amount = amountRaw ? parseGermanAmount(amountRaw) : null;
      if (amountRaw && amount === null) {
        skipped.push({ row: rowIndex + 2, reason: `Betrag "${amountRaw}" konnte nicht gelesen werden.` });
        return;
      }

      let area = idx.area >= 0 ? (cols[idx.area] || "").trim() : "";
      if (!area) area = getDefaultAreaId();
      else if (!isValidArea(area)) {
        skipped.push({ row: rowIndex + 2, reason: `Unbekannter Bereich "${area}".` });
        return;
      }

      let status = idx.status >= 0 ? (cols[idx.status] || "").trim().toLowerCase() : "offen";
      if (!STATUSES.includes(status)) status = "offen";

      const dueRaw = idx.due >= 0 ? (cols[idx.due] || "").trim() : "";
      const due_date = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null;

      insert.run({
        sender_name: senderName,
        subject,
        amount,
        due_date,
        area,
        status,
      });
      imported++;
    });
  });
  run();

  res.json({ imported, skipped });
});
