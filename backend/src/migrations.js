// Einfaches Migrationssystem: jede Migration läuft genau einmal (Tracking
// über schema_migrations), in einer Transaktion, in fester Reihenfolge.
// Neue Migrationen werden am Ende der MIGRATIONS-Liste ergänzt, bestehende
// nie verändert – so bleibt der Verlauf für jede Installation nachvollziehbar
// und bestehende Daten (Aufgaben, Rechnungen, ...) gehen nie verloren.

const DEFAULT_AREA_COLORS = {
  corelegal: "#e8b866",
  evermont: "#c8ff52",
  nachhilfe: "#7fb69e",
  allgemein: "#94a08f",
};

const MIGRATIONS = [
  {
    id: "0001_areas_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS areas (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT '#94a08f',
          sort_order INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      const seed = [
        ["corelegal", "Corelegal", 0],
        ["evermont", "Evermont", 1],
        ["nachhilfe", "Nachhilfe", 2],
        ["allgemein", "Allgemein", 3],
      ];
      const insert = db.prepare(
        "INSERT OR IGNORE INTO areas (id, label, color, sort_order, is_default) VALUES (?, ?, ?, ?, ?)",
      );
      for (const [id, label, order] of seed) {
        insert.run(id, label, DEFAULT_AREA_COLORS[id], order, id === "allgemein" ? 1 : 0);
      }
    },
  },
  {
    id: "0002_settings_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    id: "0003_relax_task_area_check",
    up(db) {
      db.exec(`
        CREATE TABLE tasks_new (
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
        INSERT INTO tasks_new SELECT * FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new RENAME TO tasks;
        CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(area);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      `);
    },
  },
  {
    id: "0004_relax_invoice_area_check",
    up(db) {
      db.exec(`
        CREATE TABLE invoices_new (
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
        INSERT INTO invoices_new SELECT * FROM invoices;
        DROP TABLE invoices;
        ALTER TABLE invoices_new RENAME TO invoices;
        CREATE INDEX IF NOT EXISTS idx_invoices_area ON invoices(area);
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
        CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
      `);
    },
  },
  {
    id: "0005_documents_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          file_name TEXT NOT NULL,
          stored_name TEXT NOT NULL UNIQUE,
          mime_type TEXT DEFAULT '',
          size INTEGER NOT NULL DEFAULT 0,
          area TEXT NOT NULL DEFAULT 'allgemein',
          tags TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_documents_area ON documents(area);
      `);
    },
  },
  {
    id: "0006_contracts_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS contracts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          provider TEXT DEFAULT '',
          area TEXT NOT NULL DEFAULT 'allgemein',
          cost REAL,
          billing_cycle TEXT NOT NULL DEFAULT 'monatlich',
          cancellation_period_days INTEGER,
          next_renewal_date TEXT,
          status TEXT NOT NULL DEFAULT 'aktiv',
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_contracts_area ON contracts(area);
        CREATE INDEX IF NOT EXISTS idx_contracts_next_renewal ON contracts(next_renewal_date);
      `);
    },
  },
  {
    id: "0007_goals_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS goals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          area TEXT NOT NULL DEFAULT 'allgemein',
          target_date TEXT,
          status TEXT NOT NULL DEFAULT 'aktiv',
          progress INTEGER NOT NULL DEFAULT 0,
          milestones TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_goals_area ON goals(area);
      `);
    },
  },
  {
    id: "0008_notes_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          area TEXT NOT NULL DEFAULT 'allgemein',
          tags TEXT NOT NULL DEFAULT '[]',
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_notes_area ON notes(area);
        CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
      `);
    },
  },
  {
    id: "0009_health_entries_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS health_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_date TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'sonstiges',
          value REAL,
          unit TEXT DEFAULT '',
          note TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_health_entries_date ON health_entries(entry_date);
        CREATE INDEX IF NOT EXISTS idx_health_entries_type ON health_entries(type);
      `);
    },
  },
];

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const applied = new Set(db.prepare("SELECT id FROM schema_migrations").all().map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const run = db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(migration.id);
    });
    run();
    console.log(`Migration angewendet: ${migration.id}`);
  }
}
