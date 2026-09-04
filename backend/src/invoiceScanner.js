import { ImapFlow } from "imapflow";
import pdfParse from "pdf-parse";
import { db } from "./db.js";
import { withTimeout, parseAreaRules, areaForAddress, configuredMailAccounts } from "./mailAccounts.js";

const SCAN_WINDOW_DAYS = 90;
const MAX_MESSAGES_PER_ACCOUNT = 150;
const CONNECTION_TIMEOUT_MS = 20000;

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
  await withTimeout(client.connect(), CONNECTION_TIMEOUT_MS, `Verbindung zu ${account.host}`);

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date();
      since.setDate(since.getDate() - SCAN_WINDOW_DAYS);
      const uids = await client.search({ since });
      const recentUids = uids.sort((a, b) => b - a).slice(0, MAX_MESSAGES_PER_ACCOUNT);

      for (const uid of recentUids) {
        const msg = await client.fetchOne(uid, { envelope: true, bodyStructure: true });
        if (!msg) continue;

        const pdfParts = collectPdfParts(msg.bodyStructure);
        if (pdfParts.length === 0) continue;

        const from = msg.envelope.from?.[0];
        const address = from?.address || "";

        for (const part of pdfParts) {
          const mailRef = `${account.id}-${uid}-${part.part}`;
          const exists = db.prepare("SELECT id FROM invoices WHERE mail_ref = ?").get(mailRef);
          if (exists) continue;

          let buffer;
          try {
            const { content } = await client.download(uid, part.part);
            buffer = await streamToBuffer(content);
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

          db.prepare(`
            INSERT INTO invoices
              (mail_ref, sender, sender_name, subject, file_name, amount, due_date, area, status, received_at)
            VALUES
              (@mail_ref, @sender, @sender_name, @subject, @file_name, @amount, @due_date, @area, @status, @received_at)
          `).run(invoice);

          created.push(invoice);
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

export async function scanForInvoices() {
  const accounts = configuredMailAccounts();
  if (accounts.length === 0) {
    const err = new Error("Mail ist nicht konfiguriert.");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const rules = parseAreaRules();
  const results = await Promise.all(accounts.map((account) => scanAccount(account, rules)));
  return results.flat();
}
