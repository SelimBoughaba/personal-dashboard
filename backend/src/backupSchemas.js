// Strikte Validierung für Backup-Vorschau und -Wiederherstellung. Jede
// Tabelle bekommt ein eigenes Schema, das Typen, Wertebereiche und Formate
// genauso durchsetzt wie die normalen POST/PATCH-Routen (siehe constants.js
// für die gemeinsamen Enums) – ein Backup ist nutzerkontrollierter Input wie
// jeder andere, kein vertrauenswürdiger interner Zustand.
//
// Zod entfernt bei einem einfachen z.object({...}) automatisch alle nicht
// deklarierten Felder (kein .passthrough()) – das geparste Ergebnis enthält
// also nie mehr Spalten, als die INSERT-Statements in routes/backup.js
// referenzieren, selbst wenn die Eingabedatei zusätzliche Felder enthält.

import { z } from "zod";
import { STORED_NAME_PATTERN } from "./documentStorage.js";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  INVOICE_STATUSES,
  CONTRACT_STATUSES,
  CONTRACT_BILLING_CYCLES,
  GOAL_STATUSES,
  HEALTH_ENTRY_TYPES,
  LINKEDIN_POST_STATUSES,
  LINK_OBJECT_TYPES,
} from "./constants.js";

const id = z.number().int().positive();

// SQLite `datetime('now')` liefert "JJJJ-MM-TT HH:MM:SS" (kein "T", keine
// Zeitzone) – z.string().datetime() ist zu strikt (erwartet echtes ISO 8601)
// und würde eigene, unveränderte Backups ablehnen.
const timestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/, "Ungültiges Zeitstempel-Format.")
  .max(40);

function isRealCalendarDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat (JJJJ-MM-TT erwartet).")
  .refine(isRealCalendarDate, "Datum existiert nicht im Kalender.");

// due_date & Co. sind in der DB NULL-fähig; ein leerer String kommt aus
// älteren Clients gelegentlich statt null – beides wird zu null normalisiert.
const nullableDateOnly = z
  .union([dateOnly, z.null(), z.literal("")])
  .transform((v) => (v ? v : null));

const nullableTimestamp = z.union([timestamp, z.null(), z.literal("")]).transform((v) => (v ? v : null));

const boolInt = z.union([z.literal(0), z.literal(1)]);

const finiteNullableNumber = z.union([z.number().finite(), z.null()]);

const shortText = (max) => z.string().max(max);
const longText = (max) => z.string().max(max);

function jsonStringArrayOfStrings(s) {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) && parsed.every((t) => typeof t === "string" && t.length <= 200);
  } catch {
    return false;
  }
}

// tags/milestones werden vom Restore-Code so übernommen, wie sie sind (Array
// -> JSON.stringify, String -> unverändert) – hier wird deshalb *beide*
// Formen zugelassen, aber ein String muss tatsächlich valides JSON sein,
// statt als Freitext direkt in die Spalte zu wandern.
const tagsField = z.union([
  z.array(z.string().max(200)).max(200),
  z.string().max(20000).refine(jsonStringArrayOfStrings, "Muss ein JSON-Array aus Strings sein."),
]);

function jsonArray(s) {
  try {
    return Array.isArray(JSON.parse(s));
  } catch {
    return false;
  }
}

const milestoneItem = z.object({
  text: z.string().max(500).optional(),
  done: z.boolean().optional(),
});
const milestonesField = z.union([
  z.array(milestoneItem).max(500),
  z.string().max(100000).refine(jsonArray, "Muss ein JSON-Array sein."),
]);

export const areaSchema = z.object({
  id: z.string().min(1).max(100),
  label: shortText(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Farbe muss ein Hex-Code #rrggbb sein."),
  sort_order: z.number().int(),
  is_default: boolInt,
  archived: boolInt,
  created_at: timestamp,
  updated_at: timestamp,
});

export const taskSchema = z.object({
  id,
  title: shortText(500),
  notes: longText(20000),
  due_date: nullableDateOnly,
  priority: z.enum(TASK_PRIORITIES),
  area: shortText(100),
  status: z.enum(TASK_STATUSES),
  created_at: timestamp,
  updated_at: timestamp,
});

export const invoiceSchema = z.object({
  id,
  mail_ref: z.union([shortText(500), z.null()]),
  sender: shortText(500),
  sender_name: shortText(500),
  subject: shortText(1000),
  file_name: shortText(500),
  amount: finiteNullableNumber,
  due_date: nullableDateOnly,
  area: shortText(100),
  status: z.enum(INVOICE_STATUSES),
  received_at: nullableTimestamp,
  created_at: timestamp,
  updated_at: timestamp,
  // Ältere Backups (Version < 9) kennen diese Felder noch nicht - defaults
  // entsprechen denen der Migration 0014 (manuell angelegt/schon bestätigt).
  source: shortText(50).default("manuell"),
  confirmed: boolInt.default(1),
});

export const documentSchema = z.object({
  id,
  title: shortText(500),
  file_name: shortText(500),
  stored_name: z.string().max(200).regex(STORED_NAME_PATTERN, "Ungültiger interner Dateiname."),
  mime_type: shortText(200),
  size: z.number().int().nonnegative(),
  area: shortText(100),
  tags: tagsField,
  created_at: timestamp,
  updated_at: timestamp,
});

export const contractSchema = z.object({
  id,
  title: shortText(500),
  provider: shortText(500),
  area: shortText(100),
  cost: finiteNullableNumber,
  billing_cycle: z.enum(CONTRACT_BILLING_CYCLES),
  cancellation_period_days: z.union([z.number().int().nonnegative(), z.null()]),
  next_renewal_date: nullableDateOnly,
  status: z.enum(CONTRACT_STATUSES),
  notes: longText(20000),
  created_at: timestamp,
  updated_at: timestamp,
});

export const goalSchema = z.object({
  id,
  title: shortText(500),
  description: longText(20000),
  area: shortText(100),
  target_date: nullableDateOnly,
  status: z.enum(GOAL_STATUSES),
  progress: z.number().int().min(0).max(100),
  milestones: milestonesField,
  created_at: timestamp,
  updated_at: timestamp,
});

export const noteSchema = z.object({
  id,
  title: shortText(500),
  content: longText(200000),
  area: shortText(100),
  tags: tagsField,
  pinned: boolInt,
  created_at: timestamp,
  updated_at: timestamp,
});

export const healthEntrySchema = z.object({
  id,
  entry_date: dateOnly,
  type: z.enum(HEALTH_ENTRY_TYPES),
  value: finiteNullableNumber,
  unit: shortText(50),
  note: longText(2000),
  created_at: timestamp,
  updated_at: timestamp,
});

export const promptSchema = z.object({
  id,
  title: shortText(500),
  content: longText(200000),
  area: shortText(100),
  tags: tagsField,
  pinned: boolInt,
  created_at: timestamp,
  updated_at: timestamp,
});

export const linkedinPostSchema = z.object({
  id,
  content: longText(20000),
  area: shortText(100),
  status: z.enum(LINKEDIN_POST_STATUSES),
  scheduled_date: nullableDateOnly,
  created_at: timestamp,
  updated_at: timestamp,
});

export const objectLinkSchema = z.object({
  id,
  a_type: z.enum(LINK_OBJECT_TYPES),
  a_id: id,
  b_type: z.enum(LINK_OBJECT_TYPES),
  b_id: id,
  created_at: timestamp,
});

// Settings: Auth-/Session-Secrets sind nie Teil eines gewöhnlichen Backups
// (siehe routes/backup.js) – dieses Schema läuft daher nur über das, was
// buildBackup() tatsächlich exportiert (Auth-Schlüssel dort bereits
// herausgefiltert), lehnt sie zusätzlich aber auch explizit ab, falls eine
// manipulierte Datei sie trotzdem enthält.
const FORBIDDEN_SETTINGS_KEYS = new Set(["auth.password_hash", "auth.jwt_secret", "auth.token_version"]);

export const TABLE_SCHEMAS = {
  areas: areaSchema,
  tasks: taskSchema,
  invoices: invoiceSchema,
  documents: documentSchema,
  contracts: contractSchema,
  goals: goalSchema,
  notes: noteSchema,
  health_entries: healthEntrySchema,
  prompts: promptSchema,
  linkedin_posts: linkedinPostSchema,
  object_links: objectLinkSchema,
};

// Validiert eine Tabelle vollständig und gibt entweder die geparsten
// (bereinigten) Zeilen oder eine sprechende Fehlermeldung mit Zeile/Feld
// zurück – nie nur "ungültig".
export function validateTable(tableName, rows) {
  const schema = TABLE_SCHEMAS[tableName];
  if (!schema) throw new Error(`Kein Schema für Tabelle "${tableName}".`);
  const parsed = [];
  for (let i = 0; i < rows.length; i++) {
    const result = schema.safeParse(rows[i]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join(".") || "(Zeile)";
      return { ok: false, error: `${tableName}, Zeile ${i + 1}, Feld "${field}": ${issue.message}` };
    }
    parsed.push(result.data);
  }
  return { ok: true, rows: parsed };
}

export function validateSettings(settings) {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    return { ok: false, error: 'Feld "settings" ist kein Objekt.' };
  }
  const clean = {};
  for (const [key, value] of Object.entries(settings)) {
    if (FORBIDDEN_SETTINGS_KEYS.has(key)) continue; // still siehe Kommentar oben
    if (typeof key !== "string" || key.length === 0 || key.length > 200) {
      return { ok: false, error: `settings: ungültiger Schlüssel "${key}".` };
    }
    clean[key] = value;
  }
  return { ok: true, settings: clean };
}

// Bereichsreferenzen dürfen nur auf tatsächlich im selben Backup enthaltene
// Bereiche zeigen – sonst könnten Aufgaben/Rechnungen/... nach der
// Wiederherstellung auf ein Nirgendwo verweisen (siehe Bereichslöschung in
// routes/areas.js, die dasselbe für den Live-Betrieb sicherstellt).
export function findDanglingAreaRef(tableName, rows, areaIds) {
  for (let i = 0; i < rows.length; i++) {
    if (!areaIds.has(rows[i].area)) {
      return `${tableName}, Zeile ${i + 1}: Bereich "${rows[i].area}" ist in diesem Backup nicht definiert.`;
    }
  }
  return null;
}
