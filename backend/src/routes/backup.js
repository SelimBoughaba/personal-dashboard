import { Router } from "express";
import { db } from "../db.js";

export const backupRouter = Router();

const BACKUP_VERSION = 8;
// Ältere Backup-Versionen kannten neuere Tabellen (documents, contracts, ...)
// noch nicht. Beim Wiederherstellen eines älteren Backups bleibt die
// jeweils fehlende Tabelle dann einfach unangetastet, statt gelöscht zu
// werden – so bleiben ältere Backups kompatibel, ohne Daten zu verlieren.
const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8];
const OPTIONAL_TABLES = [
  { key: "documents", sinceVersion: 2 },
  { key: "contracts", sinceVersion: 3 },
  { key: "goals", sinceVersion: 4 },
  { key: "notes", sinceVersion: 5 },
  { key: "health_entries", sinceVersion: 6 },
  { key: "prompts", sinceVersion: 7 },
  { key: "linkedin_posts", sinceVersion: 8 },
];

function buildBackup() {
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    tasks: db.prepare("SELECT * FROM tasks").all(),
    invoices: db.prepare("SELECT * FROM invoices").all(),
    areas: db.prepare("SELECT * FROM areas").all(),
    // Nur Metadaten, nicht der Dateiinhalt selbst – sonst würde das JSON-
    // Backup unkontrolliert groß. Der Dokumenten-Ordner auf der Platte
    // sollte separat gesichert werden (siehe README).
    documents: db.prepare("SELECT * FROM documents").all(),
    contracts: db.prepare("SELECT * FROM contracts").all(),
    goals: db.prepare("SELECT * FROM goals").all(),
    notes: db.prepare("SELECT * FROM notes").all(),
    health_entries: db.prepare("SELECT * FROM health_entries").all(),
    prompts: db.prepare("SELECT * FROM prompts").all(),
    linkedin_posts: db.prepare("SELECT * FROM linkedin_posts").all(),
    settings: Object.fromEntries(
      db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, r.value]),
    ),
  };
}

function validateBackup(data) {
  if (!data || typeof data !== "object") return "Datei ist kein gültiges Backup (kein JSON-Objekt).";
  if (!SUPPORTED_VERSIONS.includes(data.version)) {
    return `Nicht unterstützte Backup-Version (${data.version}).`;
  }
  for (const key of ["tasks", "invoices", "areas"]) {
    if (!Array.isArray(data[key])) return `Feld "${key}" fehlt oder ist keine Liste.`;
  }
  for (const { key, sinceVersion } of OPTIONAL_TABLES) {
    if (data.version >= sinceVersion && !Array.isArray(data[key])) {
      return `Feld "${key}" fehlt oder ist keine Liste.`;
    }
  }
  if (typeof data.settings !== "object" || data.settings === null) {
    return `Feld "settings" fehlt oder ist kein Objekt.`;
  }
  return null;
}

// Lädt das komplette lokale Backup als Datei herunter. Enthält auch
// gespeicherte Zugangsdaten (Kalender/Mail) im Klartext, genau wie die
// lokale Datenbank selbst – die Datei sollte entsprechend sicher
// aufbewahrt werden (z. B. auf einem verschlüsselten Volume).
backupRouter.get("/", (req, res) => {
  const backup = buildBackup();
  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="dashboard-backup-${new Date().toISOString().slice(0, 10)}.json"`,
  );
  res.send(JSON.stringify(backup, null, 2));
});

// Validiert eine hochgeladene Backup-Datei und liefert nur eine Vorschau
// (Anzahl Einträge), ohne irgendetwas zu verändern.
backupRouter.post("/preview", (req, res) => {
  const data = req.body?.data;
  const error = validateBackup(data);
  if (error) return res.status(400).json({ valid: false, error });

  res.json({
    valid: true,
    exported_at: data.exported_at || null,
    counts: {
      tasks: data.tasks.length,
      invoices: data.invoices.length,
      areas: data.areas.length,
      documents: Array.isArray(data.documents) ? data.documents.length : 0,
      contracts: Array.isArray(data.contracts) ? data.contracts.length : 0,
      goals: Array.isArray(data.goals) ? data.goals.length : 0,
      notes: Array.isArray(data.notes) ? data.notes.length : 0,
      health_entries: Array.isArray(data.health_entries) ? data.health_entries.length : 0,
      prompts: Array.isArray(data.prompts) ? data.prompts.length : 0,
      linkedin_posts: Array.isArray(data.linkedin_posts) ? data.linkedin_posts.length : 0,
      settings: Object.keys(data.settings).length,
    },
  });
});

// Ersetzt den kompletten lokalen Datenbestand durch den Inhalt des
// Backups. Erfordert confirm:true, damit ein versehentlicher Aufruf ohne
// vorherige Warnung im Frontend nicht möglich ist.
backupRouter.post("/restore", (req, res) => {
  const { data, confirm } = req.body || {};
  const error = validateBackup(data);
  if (error) return res.status(400).json({ error });
  if (!confirm) {
    return res.status(400).json({ error: "Bestätigung erforderlich (confirm: true) – überschreibt alle lokalen Daten." });
  }

  const run = db.transaction(() => {
    db.exec("DELETE FROM tasks; DELETE FROM invoices; DELETE FROM areas; DELETE FROM settings;");
    if (Array.isArray(data.documents)) db.exec("DELETE FROM documents;");
    if (Array.isArray(data.contracts)) db.exec("DELETE FROM contracts;");
    if (Array.isArray(data.goals)) db.exec("DELETE FROM goals;");
    if (Array.isArray(data.notes)) db.exec("DELETE FROM notes;");
    if (Array.isArray(data.health_entries)) db.exec("DELETE FROM health_entries;");
    if (Array.isArray(data.prompts)) db.exec("DELETE FROM prompts;");
    if (Array.isArray(data.linkedin_posts)) db.exec("DELETE FROM linkedin_posts;");

    const insertArea = db.prepare(
      "INSERT INTO areas (id, label, color, sort_order, is_default, archived, created_at, updated_at) VALUES (@id, @label, @color, @sort_order, @is_default, @archived, @created_at, @updated_at)",
    );
    for (const area of data.areas) insertArea.run(area);

    const insertTask = db.prepare(
      "INSERT INTO tasks (id, title, notes, due_date, priority, area, status, created_at, updated_at) VALUES (@id, @title, @notes, @due_date, @priority, @area, @status, @created_at, @updated_at)",
    );
    for (const task of data.tasks) insertTask.run(task);

    const insertInvoice = db.prepare(
      `INSERT INTO invoices (id, mail_ref, sender, sender_name, subject, file_name, amount, due_date, area, status, received_at, created_at, updated_at)
       VALUES (@id, @mail_ref, @sender, @sender_name, @subject, @file_name, @amount, @due_date, @area, @status, @received_at, @created_at, @updated_at)`,
    );
    for (const invoice of data.invoices) insertInvoice.run(invoice);

    if (Array.isArray(data.documents)) {
      const insertDocument = db.prepare(
        `INSERT INTO documents (id, title, file_name, stored_name, mime_type, size, area, tags, created_at, updated_at)
         VALUES (@id, @title, @file_name, @stored_name, @mime_type, @size, @area, @tags, @created_at, @updated_at)`,
      );
      for (const document of data.documents) {
        insertDocument.run({ ...document, tags: typeof document.tags === "string" ? document.tags : JSON.stringify(document.tags || []) });
      }
    }

    if (Array.isArray(data.contracts)) {
      const insertContract = db.prepare(
        `INSERT INTO contracts (id, title, provider, area, cost, billing_cycle, cancellation_period_days, next_renewal_date, status, notes, created_at, updated_at)
         VALUES (@id, @title, @provider, @area, @cost, @billing_cycle, @cancellation_period_days, @next_renewal_date, @status, @notes, @created_at, @updated_at)`,
      );
      for (const contract of data.contracts) insertContract.run(contract);
    }

    if (Array.isArray(data.goals)) {
      const insertGoal = db.prepare(
        `INSERT INTO goals (id, title, description, area, target_date, status, progress, milestones, created_at, updated_at)
         VALUES (@id, @title, @description, @area, @target_date, @status, @progress, @milestones, @created_at, @updated_at)`,
      );
      for (const goal of data.goals) {
        insertGoal.run({ ...goal, milestones: typeof goal.milestones === "string" ? goal.milestones : JSON.stringify(goal.milestones || []) });
      }
    }

    if (Array.isArray(data.notes)) {
      const insertNote = db.prepare(
        `INSERT INTO notes (id, title, content, area, tags, pinned, created_at, updated_at)
         VALUES (@id, @title, @content, @area, @tags, @pinned, @created_at, @updated_at)`,
      );
      for (const note of data.notes) {
        insertNote.run({ ...note, tags: typeof note.tags === "string" ? note.tags : JSON.stringify(note.tags || []) });
      }
    }

    if (Array.isArray(data.health_entries)) {
      const insertHealthEntry = db.prepare(
        `INSERT INTO health_entries (id, entry_date, type, value, unit, note, created_at, updated_at)
         VALUES (@id, @entry_date, @type, @value, @unit, @note, @created_at, @updated_at)`,
      );
      for (const entry of data.health_entries) insertHealthEntry.run(entry);
    }

    if (Array.isArray(data.prompts)) {
      const insertPrompt = db.prepare(
        `INSERT INTO prompts (id, title, content, area, tags, pinned, created_at, updated_at)
         VALUES (@id, @title, @content, @area, @tags, @pinned, @created_at, @updated_at)`,
      );
      for (const prompt of data.prompts) {
        insertPrompt.run({ ...prompt, tags: typeof prompt.tags === "string" ? prompt.tags : JSON.stringify(prompt.tags || []) });
      }
    }

    if (Array.isArray(data.linkedin_posts)) {
      const insertPost = db.prepare(
        `INSERT INTO linkedin_posts (id, content, area, status, scheduled_date, created_at, updated_at)
         VALUES (@id, @content, @area, @status, @scheduled_date, @created_at, @updated_at)`,
      );
      for (const post of data.linkedin_posts) insertPost.run(post);
    }

    const insertSetting = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(data.settings)) {
      insertSetting.run(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  });

  try {
    run();
  } catch (err) {
    console.error("Backup-Wiederherstellung fehlgeschlagen:", err);
    return res.status(400).json({ error: "Wiederherstellung fehlgeschlagen. Datei möglicherweise beschädigt." });
  }

  res.json({ ok: true });
});
