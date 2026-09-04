import { Router } from "express";
import { db } from "../db.js";
import { scanForInvoices } from "../invoiceScanner.js";
import { AREAS, INVOICE_STATUSES as STATUSES } from "../constants.js";

export const invoicesRouter = Router();

invoicesRouter.get("/", (req, res) => {
  const { area, status } = req.query;
  let query = "SELECT * FROM invoices";
  const clauses = [];
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
    res.json({ new: created.length });
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") {
      return res.status(503).json({
        error: "Mail ist nicht konfiguriert (IONOS_IMAP_* fehlen in .env).",
      });
    }
    console.error("Rechnungs-Scan-Fehler:", err);
    res.status(502).json({
      error: "Postfach konnte nicht durchsucht werden. IMAP-Zugangsdaten/Host prüfen.",
    });
  }
});

function validateInvoiceInput(body) {
  const errors = [];
  if (body.area !== undefined && !AREAS.includes(body.area)) errors.push("Ungültiger Bereich.");
  if (body.status !== undefined && !STATUSES.includes(body.status)) errors.push("Ungültiger Status.");
  if (body.amount !== undefined && body.amount !== null && Number.isNaN(Number(body.amount))) {
    errors.push("Ungültiger Betrag.");
  }
  return errors;
}

invoicesRouter.post("/", (req, res) => {
  const body = req.body || {};
  const errors = validateInvoiceInput(body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const stmt = db.prepare(`
    INSERT INTO invoices (sender, sender_name, subject, amount, due_date, area, status)
    VALUES (@sender, @sender_name, @subject, @amount, @due_date, @area, @status)
  `);
  const info = stmt.run({
    sender: body.sender || "",
    sender_name: body.sender_name || "",
    subject: body.subject || "",
    amount: body.amount === "" || body.amount === undefined ? null : Number(body.amount),
    due_date: body.due_date || null,
    area: body.area || "allgemein",
    status: body.status || "offen",
  });

  res.status(201).json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(info.lastInsertRowid));
});

invoicesRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Rechnung nicht gefunden." });

  const body = req.body || {};
  const errors = validateInvoiceInput(body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const merged = {
    id: req.params.id,
    sender: body.sender ?? existing.sender,
    sender_name: body.sender_name ?? existing.sender_name,
    subject: body.subject ?? existing.subject,
    amount:
      body.amount === undefined ? existing.amount : body.amount === "" || body.amount === null ? null : Number(body.amount),
    due_date: body.due_date === undefined ? existing.due_date : body.due_date || null,
    area: body.area ?? existing.area,
    status: body.status ?? existing.status,
  };

  db.prepare(`
    UPDATE invoices SET sender=@sender, sender_name=@sender_name, subject=@subject,
      amount=@amount, due_date=@due_date, area=@area, status=@status, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id));
});

invoicesRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM invoices WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Rechnung nicht gefunden." });
  res.status(204).send();
});
