import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "dashboard.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT DEFAULT '',
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('niedrig', 'mittel', 'hoch')),
    area TEXT NOT NULL DEFAULT 'allgemein' CHECK (area IN ('corelegal', 'evermont', 'nachhilfe', 'allgemein')),
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
    area TEXT NOT NULL DEFAULT 'allgemein' CHECK (area IN ('corelegal', 'evermont', 'nachhilfe', 'allgemein')),
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen', 'bezahlt')),
    received_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
