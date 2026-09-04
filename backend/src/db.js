import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "dashboard.db"));
db.pragma("journal_mode = WAL");

// Basis-Schema für Neuinstallationen. `area` trägt hier bewusst keinen
// CHECK-Constraint (Bereiche sind seit der areas-Tabelle nutzerdefinierbar) –
// bestehende Installationen erhalten dieselbe Struktur über die Migrationen
// unten, ohne vorhandene Daten zu verlieren.
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT DEFAULT '',
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('niedrig', 'mittel', 'hoch')),
    area TEXT NOT NULL DEFAULT 'allgemein',
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'erledigt')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mail_ref TEXT UNIQUE,
    sender TEXT DEFAULT '',
    sender_name TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    file_name TEXT DEFAULT '',
    amount REAL,
    due_date TEXT,
    area TEXT NOT NULL DEFAULT 'allgemein',
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bezahlt')),
    received_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(area);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

  CREATE INDEX IF NOT EXISTS idx_invoices_area ON invoices(area);
  CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
  CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
`);

// Schema-Migrationen für alles, was nach dem Basis-Schema dazukam
// (areas-Tabelle, settings-Tabelle, Auflösung alter CHECK-Constraints bei
// bereits bestehenden Installationen). Läuft bei jedem Start, jede
// Migration greift dank Tracking nur einmal.
runMigrations(db);

// Zentrale Bereichs-Hilfsfunktionen, von Routen und Mail-/Rechnungs-Logik
// gemeinsam genutzt (Lebensbereiche sind seit der areas-Tabelle
// nutzerdefinierbar, kein fester Enum mehr).
export function isValidArea(id) {
  return !!db.prepare("SELECT id FROM areas WHERE id = ?").get(id);
}

export function getDefaultAreaId() {
  const row =
    db.prepare("SELECT id FROM areas WHERE is_default = 1 LIMIT 1").get() ||
    db.prepare("SELECT id FROM areas ORDER BY sort_order ASC LIMIT 1").get();
  return row ? row.id : "allgemein";
}
