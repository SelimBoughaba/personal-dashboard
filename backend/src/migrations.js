// Einfaches Migrationssystem: jede Migration läuft genau einmal (Tracking
// über schema_migrations), in einer Transaktion, in fester Reihenfolge.
// Neue Migrationen werden am Ende der MIGRATIONS-Liste ergänzt, bestehende
// nie verändert – so bleibt der Verlauf für jede Installation nachvollziehbar
// und bestehende Daten (Aufgaben, Rechnungen, ...) gehen nie verloren.

import { AREA_OWNED_TABLES } from "./constants.js";

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
  {
    id: "0010_add_privat_universitaet_areas",
    up(db) {
      const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM areas").get().m;
      const insert = db.prepare(
        "INSERT OR IGNORE INTO areas (id, label, color, sort_order, is_default) VALUES (?, ?, ?, ?, 0)",
      );
      insert.run("privat", "Privat", "#8aa9c9", maxOrder + 1);
      insert.run("universitaet", "Universität", "#c98a6b", maxOrder + 2);
    },
  },
  {
    id: "0011_prompts_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS prompts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          area TEXT NOT NULL DEFAULT 'allgemein',
          tags TEXT NOT NULL DEFAULT '[]',
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_prompts_area ON prompts(area);
      `);
    },
  },
  {
    id: "0012_linkedin_posts_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS linkedin_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content TEXT NOT NULL DEFAULT '',
          area TEXT NOT NULL DEFAULT 'allgemein',
          status TEXT NOT NULL DEFAULT 'entwurf',
          scheduled_date TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_linkedin_posts_status ON linkedin_posts(status);
      `);
    },
  },
  {
    // Repariert Bereichsreferenzen, die vor dieser Änderung entstanden sein
    // könnten (z. B. durch die zuvor unvollständige Bereichslöschung in
    // routes/areas.js, die nur tasks/invoices reassignt hat). Läuft einmalig
    // über alle Tabellen aus AREA_OWNED_TABLES; jede Zeile, deren area-Wert
    // in keiner aktuell existierenden areas.id-Zeile vorkommt, wird auf den
    // aktiven Default-Bereich umgehängt statt auf einen "toten" Bereich
    // zeigen zu lassen.
    id: "0013_repair_orphaned_area_refs",
    up(db) {
      const areaIds = new Set(db.prepare("SELECT id FROM areas").all().map((r) => r.id));
      const fallback =
        db.prepare("SELECT id FROM areas WHERE is_default = 1 AND archived = 0 LIMIT 1").get()?.id ||
        db.prepare("SELECT id FROM areas WHERE archived = 0 ORDER BY sort_order ASC LIMIT 1").get()?.id ||
        db.prepare("SELECT id FROM areas ORDER BY sort_order ASC LIMIT 1").get()?.id;
      if (!fallback) return; // keine Bereiche vorhanden - kann bei einer Neuinstallation nach 0001 nicht vorkommen

      for (const table of AREA_OWNED_TABLES) {
        const badAreas = db
          .prepare(`SELECT DISTINCT area FROM ${table}`)
          .all()
          .map((r) => r.area)
          .filter((a) => a !== null && !areaIds.has(a));
        for (const badArea of badAreas) {
          const info = db.prepare(`UPDATE ${table} SET area = ? WHERE area = ?`).run(fallback, badArea);
          if (info.changes > 0) {
            console.log(
              `Migration 0013: ${info.changes} verwaiste ${table}-Zeile(n) mit Bereich "${badArea}" auf "${fallback}" umgezogen.`,
            );
          }
        }
      }
    },
  },
  {
    // Rechnungserkennung aus PDF-Anhängen ist eine Heuristik (siehe
    // invoiceScanner.js) - Betrag/Fälligkeitsdatum können falsch erkannt
    // sein. source/confirmed machen sichtbar, ob eine Rechnung manuell
    // angelegt bzw. bereits geprüft wurde, oder noch ein ungeprüfter
    // Scan-Vorschlag ist.
    id: "0014_invoice_suggestion_fields",
    up(db) {
      db.exec(`
        ALTER TABLE invoices ADD COLUMN source TEXT NOT NULL DEFAULT 'manuell';
        ALTER TABLE invoices ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1;
      `);
      // Bereits vorhandene, aus einem Mail-Scan stammende Rechnungen
      // (erkennbar an gesetztem mail_ref) rückwirkend als solche markieren.
      // Ob sie der Nutzer schon geprüft hat, ist nicht mehr rekonstruierbar
      // - bewusst als unbestätigt einstufen statt optimistisch als geprüft,
      // damit nichts Ungeprüftes fälschlich als bestätigt gilt.
      db.exec(`UPDATE invoices SET source = 'mail_scan', confirmed = 0 WHERE mail_ref IS NOT NULL;`);
    },
  },
  {
    // Kontextlinks zwischen verwandten Objekten (Punkt 69 der Design-
    // Erweiterung): eine Zeile pro sichtbarer, vom Nutzer selbst gesetzter
    // Beziehung (z. B. Rechnung <-> Vertrag), kein automatisches Ableiten.
    // a_type/a_id und b_type/b_id statt einer FK-Spalte pro Zieltabelle,
    // weil eine Verknüpfung zwischen JEDEM Paar der in LINK_OBJECT_TABLES
    // gelisteten Typen möglich sein soll, ohne für jede Kombination eine
    // eigene Spalte zu brauchen.
    id: "0015_object_links_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS object_links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          a_type TEXT NOT NULL,
          a_id INTEGER NOT NULL,
          b_type TEXT NOT NULL,
          b_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_object_links_a ON object_links (a_type, a_id);
        CREATE INDEX IF NOT EXISTS idx_object_links_b ON object_links (b_type, b_id);
      `);
    },
  },
  {
    // Wiederkehrende Aufgaben (Punkt 66): die Wiederholungsregel liegt als
    // JSON auf der aktuell offenen Instanz selbst (Freq/Intervall/nur
    // werktags/Modus/Enddatum), keine eigene Tabelle - jede erzeugte
    // Folgeinstanz ist eine ganz normale, unabhängige tasks-Zeile mit
    // kopierter Regel. Das macht "nur diese Instanz bearbeiten" trivial
    // (jede Zeile ist ohnehin für sich bearbeitbar) ohne ein virtuelles
    // Instanz-Modell wie bei iCal-RRULE zu brauchen.
    id: "0016_task_recurrence",
    up(db) {
      db.exec(`ALTER TABLE tasks ADD COLUMN recurrence TEXT;`);
    },
  },
  {
    // "Regelmäßige selbst gewählte Überprüfung" für Ziele (Punkt 78):
    // review_freq ist bewusst kein frei wählbares Intervall wie bei
    // Aufgaben, sondern eine von drei festen Kadenzen - ein Ziel braucht
    // keine tägliche/wöchentliche Wiederholung, eher einen ruhigen
    // Rhythmus zum Innehalten.
    id: "0017_goal_review",
    up(db) {
      db.exec(`
        ALTER TABLE goals ADD COLUMN review_freq TEXT;
        ALTER TABLE goals ADD COLUMN next_review_date TEXT;
      `);
    },
  },
  {
    // Wochenrückblick (Punkt 68): nur der ABGESCHLOSSENE Rückblick wird
    // gespeichert, und auch dann nur als datensparsamer Snapshot (Zahlen +
    // Kurztitel, siehe routes/weekReviews.js) - nicht die vollständigen
    // Aufgaben-/Rechnungsobjekte dieser Woche. Ein noch offener Rückblick
    // wird jedes Mal frisch aus tasks/invoices/contracts/Kalender
    // berechnet, landet also gar nicht in dieser Tabelle.
    id: "0018_week_reviews_table",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS week_reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          week_start TEXT NOT NULL UNIQUE,
          closed_at TEXT NOT NULL DEFAULT (datetime('now')),
          summary TEXT NOT NULL
        );
      `);
    },
  },
  {
    // Benachrichtigungszentrum (Punkt 76): Fristen und Integrationsfehler
    // werden bei jedem Abruf LIVE aus tasks/invoices/contracts bzw. aus dem
    // Ergebnis des letzten echten Verbindungsversuchs berechnet (siehe
    // notifications.js) - nichts davon liegt dauerhaft in einer Tabelle.
    // Zwei schmale Tabellen genügen: notification_events hält nur die
    // Ereignisse, die sich NICHT aus dem aktuellen Datenstand
    // rekonstruieren lassen (abgeschlossener Hintergrund-Scan, laufender
    // Integrationsfehler) - mit bewusst generischem, nicht-sensiblem
    // Titel/Text (z. B. "3 neue Rechnungsvorschläge", nie Absender/Beträge).
    // notification_states hält je Benachrichtigung nur den
    // Gelesen/Erledigt/Verschoben-Status (Schlüssel statt Fremdschlüssel,
    // damit dieselbe Tabelle sowohl live berechnete als auch gespeicherte
    // Benachrichtigungen abdecken kann).
    id: "0019_notifications_tables",
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notification_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS notification_states (
          key TEXT PRIMARY KEY,
          read_at TEXT,
          done_at TEXT,
          snoozed_until TEXT
        );
      `);
    },
  },
  {
    // Papierkorb (Punkt 77): "Löschen" auf den acht wichtigen Inhaltstypen
    // setzt ab jetzt nur noch deleted_at statt die Zeile wirklich zu
    // entfernen - siehe trash.js für die Wiederherstellungs-/Aufbewahrungs-
    // logik. health_entries/areas/object_links bleiben bewusst außen vor
    // (siehe trash.js-Kommentar). NULL bleibt der Normalzustand (aktiv,
    // nicht im Papierkorb) - jede bestehende Zeile bleibt dadurch unverändert
    // sichtbar, kein Backfill nötig.
    id: "0020_trash_columns",
    up(db) {
      db.exec(`
        ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
        ALTER TABLE invoices ADD COLUMN deleted_at TEXT;
        ALTER TABLE documents ADD COLUMN deleted_at TEXT;
        ALTER TABLE contracts ADD COLUMN deleted_at TEXT;
        ALTER TABLE goals ADD COLUMN deleted_at TEXT;
        ALTER TABLE notes ADD COLUMN deleted_at TEXT;
        ALTER TABLE prompts ADD COLUMN deleted_at TEXT;
        ALTER TABLE linkedin_posts ADD COLUMN deleted_at TEXT;
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
