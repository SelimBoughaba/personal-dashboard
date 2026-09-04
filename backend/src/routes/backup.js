import { Router } from "express";
import { db } from "../db.js";

export const backupRouter = Router();

const BACKUP_VERSION = 1;

function buildBackup() {
  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    tasks: db.prepare("SELECT * FROM tasks").all(),
    invoices: db.prepare("SELECT * FROM invoices").all(),
    areas: db.prepare("SELECT * FROM areas").all(),
    settings: Object.fromEntries(
      db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, r.value]),
    ),
  };
}

function validateBackup(data) {
  if (!data || typeof data !== "object") return "Datei ist kein gültiges Backup (kein JSON-Objekt).";
  if (data.version !== BACKUP_VERSION) return `Nicht unterstützte Backup-Version (${data.version}).`;
  for (const key of ["tasks", "invoices", "areas"]) {
    if (!Array.isArray(data[key])) return `Feld "${key}" fehlt oder ist keine Liste.`;
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
