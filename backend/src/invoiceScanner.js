import { ImapFlow } from "imapflow";
import pdfParse from "pdf-parse";
import { db } from "./db.js";
import { withTimeout, parseAreaRules, areaForAddress, configuredMailAccounts } from "./mailAccounts.js";

const SCAN_WINDOW_DAYS = 90;
const MAX_MESSAGES_PER_ACCOUNT = 150;
const CONNECTION_TIMEOUT_MS = 20000;
const LOCK_TIMEOUT_MS = 20000;
// Nie einen beliebig großen Anhang unbegrenzt in den Hauptprozess laden –
// eine 500-MB-"PDF"-Datei würde sonst den Speicher des gesamten Servers
// belasten. 25 MB deckt reale Rechnungs-PDFs großzügig ab.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Reihenfolge = Priorität: spezifischere Begriffe zuerst, damit z. B.
// "Gesamtbetrag" vor "Nettobetrag" gewinnt (beide enthalten "betrag").
const AMOUNT_KEYWORDS_PRIORITY = [
  "gesamtbetrag",
  "endbetrag",
  "rechnungsbetrag",
  "zahlbetrag",
  "zu zahlen",
  "gesamtsumme",
];
const AMOUNT_KEYWORDS_FALLBACK = ["betrag", "summe"];
const AMOUNT_EXCLUDE = /(netto|zwischensumme|ust\.?-?satz|steuersatz|mwst)/i;
const AMOUNT_PATTERN = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|eur)?/i;
const DUE_KEYWORDS = /(fällig(?:keitsdatum)?|zahlbar\s*bis|zahlungsziel)/i;
const DATE_PATTERN = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/;

export function parseGermanAmount(str) {
  const normalized = str.replace(/\./g, "").replace(",", ".");
  const value = parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

function findAmountByKeywords(lines, keywords, { excludeMatches = false } = {}) {
  for (const keyword of keywords) {
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (!lower.includes(keyword)) continue;
      if (excludeMatches && AMOUNT_EXCLUDE.test(line)) continue;
      const match = line.match(AMOUNT_PATTERN);
      if (match) return parseGermanAmount(match[1]);
    }
  }
  return null;
}

// Sucht zuerst nach Beträgen in der Nähe spezifischer Schlüsselwörter
// ("Gesamtbetrag", "Rechnungsbetrag", ...), dann nach generischeren
// Begriffen (aber nie in Netto-/Zwischensummen-Zeilen). Findet sich
// nichts, wird hilfsweise der größte im Dokument vorkommende Eurobetrag
// verwendet. Das ist eine Heuristik, keine exakte Erkennung – daher
// bleibt manuelles Korrigieren im Frontend möglich.
export function extractAmount(text) {
  const lines = text.split(/\r?\n/);

  const priorityMatch = findAmountByKeywords(lines, AMOUNT_KEYWORDS_PRIORITY);
  if (priorityMatch !== null) return priorityMatch;

  const fallbackMatch = findAmountByKeywords(lines, AMOUNT_KEYWORDS_FALLBACK, { excludeMatches: true });
  if (fallbackMatch !== null) return fallbackMatch;

  const all = [...text.matchAll(new RegExp(AMOUNT_PATTERN, "gi"))]
    .map((m) => parseGermanAmount(m[1]))
    .filter((v) => v !== null);
  return all.length ? Math.max(...all) : null;
}

export function extractDueDate(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (DUE_KEYWORDS.test(line)) {
      const match = line.match(DATE_PATTERN);
      if (match) return toIsoDate(match);
    }
  }
  return null;
}

function toIsoDate(match) {
  const [, day, month, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  const d = day.padStart(2, "0");
  const m = month.padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function isPdfPart(node) {
  const type = `${node.type || ""}/${node.subtype || ""}`.toLowerCase();
  const filename = (node.dispositionParameters?.filename || node.parameters?.name || "").toLowerCase();
  return type === "application/pdf" || filename.endsWith(".pdf");
}

function collectPdfParts(node, acc = []) {
  if (!node) return acc;
  if (isPdfPart(node)) acc.push(node);
  if (node.childNodes) {
    for (const child of node.childNodes) collectPdfParts(child, acc);
  }
  return acc;
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function scanAccount(account, rules) {
  const client = new ImapFlow({
    host: account.host,
    port: Number(account.port) || 993,
    secure: true,
    auth: { user: account.user, pass: account.password },
    logger: false,
  });

  const created = [];
  try {
    await withTimeout(client.connect(), CONNECTION_TIMEOUT_MS, `Verbindung zu ${account.host}`);
  } catch (err) {
    // Falls connect() selbst durch den Timeout "gewonnen" hat, kann die
    // zugrunde liegende Verbindung im Hintergrund trotzdem noch aufgebaut
    // werden. Ohne close() bliebe dieser Socket offen und würde nie
    // aufgeräumt (Leak bei jedem erneuten Scan-Versuch).
    client.close();
    throw err;
  }

  // INSERT OR IGNORE statt SELECT-dann-INSERT: bei zwei sich
  // überschneidenden Scans (Doppelklick, zwei Browser-Tabs) verhindert die
  // UNIQUE-Constraint auf mail_ref sonst zwar Duplikate, aber der zweite
  // Scan-Lauf würde beim Insert-Versuch eine ungefangene Exception werfen
  // und damit ALLE noch nicht verarbeiteten Nachrichten dieses Kontos
  // überspringen (Abbruch der for-Schleife). OR IGNORE macht denselben
  // Fall zu einem harmlosen No-op, info.changes verrät, ob wirklich neu
  // eingefügt wurde.
  const insertInvoice = db.prepare(`
    INSERT OR IGNORE INTO invoices
      (mail_ref, sender, sender_name, subject, file_name, amount, due_date, area, status, received_at, source, confirmed)
    VALUES
      (@mail_ref, @sender, @sender_name, @subject, @file_name, @amount, @due_date, @area, @status, @received_at, 'mail_scan', 0)
  `);

  try {
    const lock = await client.getMailboxLock("INBOX", { acquireTimeout: LOCK_TIMEOUT_MS });
    try {
      // UIDVALIDITY wird Teil von mail_ref (siehe unten): wird eine Mailbox
      // serverseitig neu aufgebaut, ändert sich dieser Wert und dieselbe
      // UID-Zahl kann danach eine völlig andere Nachricht meinen. Ohne
      // UIDVALIDITY im Schlüssel könnte ein Scan nach so einem Wechsel eine
      // neue Rechnung fälschlich als "schon bekannt" überspringen, oder
      // umgekehrt eine alte, längst verarbeitete Nachricht erneut anlegen.
      const uidValidity = client.mailbox?.uidValidity ?? "unknown";

      const since = new Date();
      since.setDate(since.getDate() - SCAN_WINDOW_DAYS);
      // { uid: true }: siehe ausführlicher Kommentar in imap.js – ohne
      // diese Option liefert/erwartet imapflow Sequenznummern statt UIDs.
      // Hier besonders wichtig, weil das Ergebnis unten in mail_ref
      // persistiert wird (Sequenznummern sind nur innerhalb einer
      // Verbindung gültig, keine stabile Kennung über mehrere Scans).
      const uids = await client.search({ since }, { uid: true });
      const recentUids = uids.sort((a, b) => b - a).slice(0, MAX_MESSAGES_PER_ACCOUNT);

      for (const uid of recentUids) {
        const msg = await client.fetchOne(uid, { envelope: true, bodyStructure: true }, { uid: true });
        if (!msg) continue;

        const pdfParts = collectPdfParts(msg.bodyStructure);
        if (pdfParts.length === 0) continue;

        const from = msg.envelope.from?.[0];
        const address = from?.address || "";

        for (const part of pdfParts) {
          const mailRef = `${account.id}-${uidValidity}-${uid}-${part.part}`;

          let buffer;
          try {
            const { meta, content } = await client.download(uid, part.part, {
              uid: true,
              maxBytes: MAX_ATTACHMENT_BYTES,
            });
            if (meta.expectedSize && meta.expectedSize > MAX_ATTACHMENT_BYTES) {
              content.destroy();
              continue;
            }
            buffer = await streamToBuffer(content);
            if (buffer.length > MAX_ATTACHMENT_BYTES) continue;
          } catch {
            continue;
          }

          let text = "";
          try {
            const parsed = await pdfParse(buffer);
            text = parsed.text || "";
          } catch {
            continue;
          }

          const invoice = {
            mail_ref: mailRef,
            sender: address,
            sender_name: from?.name || address,
            subject: msg.envelope.subject || "",
            file_name: part.dispositionParameters?.filename || part.parameters?.name || "Anhang.pdf",
            amount: extractAmount(text),
            due_date: extractDueDate(text),
            area: areaForAddress(address, rules),
            status: "offen",
            received_at: msg.envelope.date ? new Date(msg.envelope.date).toISOString() : null,
          };

          const info = insertInvoice.run(invoice);
          if (info.changes > 0) created.push(invoice);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await withTimeout(client.logout(), 5000, "Abmelden");
    } catch {
      client.close();
    }
  }

  return created;
}

// Liefert neben den neu angelegten Rechnungen auch das Ergebnis JEDES
// einzelnen Kontos (Punkt 87, Teilumfang: "letzte Fehler ... pro Konto
// getrennt halten") - der Aufrufer (routes/invoices.js) nutzt das, um
// Integrationsfehler pro Postfach statt eines einzigen globalen Zustands
// zu verfolgen, damit ein gestörtes Konto ein funktionierendes zweites
// nicht als "auch fehlerhaft" erscheinen lässt.
export async function scanForInvoices() {
  const accounts = configuredMailAccounts();
  if (accounts.length === 0) {
    const err = new Error("Mail ist nicht konfiguriert.");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const rules = parseAreaRules();
  const settled = await Promise.allSettled(accounts.map((account) => scanAccount(account, rules)));

  const created = [];
  const accountResults = [];
  settled.forEach((result, i) => {
    const account = accounts[i];
    if (result.status === "fulfilled") {
      created.push(...result.value);
      accountResults.push({ id: account.id, label: account.label || account.id, ok: true, error: null });
    } else {
      console.error(`Rechnungs-Scan-Fehler (${account.id}):`, result.reason);
      accountResults.push({
        id: account.id,
        label: account.label || account.id,
        ok: false,
        error: "IMAP-Zugangsdaten/Host prüfen.",
      });
    }
  });

  // Nur wenn ALLE Konten fehlschlagen, den Fehler nach oben reichen –
  // ein einzelnes gestörtes Postfach soll den Scan der anderen Konten
  // nicht verhindern.
  if (settled.every((r) => r.status === "rejected")) {
    const err = settled[0].reason;
    err.accountResults = accountResults;
    throw err;
  }

  return { created, accountResults };
}
