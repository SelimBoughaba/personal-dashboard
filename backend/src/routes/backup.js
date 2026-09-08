import { Router } from "express";
import express from "express";
import { db } from "../db.js";
import { validateTable, validateSettings, findDanglingAreaRef } from "../backupSchemas.js";

export const backupRouter = Router();

// Ein volles Backup (v. a. Dokument-Metadaten, Notizen, Rechnungen über
// Jahre) kann leicht über das globale 1-MB-JSON-Limit aus index.js wachsen –
// das eigene Backup wäre dann nicht mehr wiederherstellbar. Nur diese Route
// bekommt ein größeres, aber weiterhin begrenztes Budget (kein unbegrenztes
// globales Limit).
const backupJsonParser = express.json({ limit: "40mb" });

const BACKUP_VERSION = 10;
// Ältere Backup-Versionen kannten neuere Tabellen (documents, contracts, ...)
// noch nicht. Beim Wiederherstellen eines älteren Backups bleibt die
// jeweils fehlende Tabelle dann einfach unangetastet, statt gelöscht zu
// werden – so bleiben ältere Backups kompatibel, ohne Daten zu verlieren.
const SUPPORTED_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const OPTIONAL_TABLES = [
  { key: "documents", sinceVersion: 2 },
  { key: "contracts", sinceVersion: 3 },
  { key: "goals", sinceVersion: 4 },
  { key: "notes", sinceVersion: 5 },
  { key: "health_entries", sinceVersion: 6 },
  { key: "prompts", sinceVersion: 7 },
  { key: "linkedin_posts", sinceVersion: 8 },
  { key: "object_links", sinceVersion: 9 },
  { key: "week_reviews", sinceVersion: 10 },
];
const REQUIRED_TABLES = ["tasks", "invoices", "areas"];

// Zugangsdaten und Auth-Zustand sind kein "gewöhnlicher" Nutzerinhalt:
// - Beim Export nie mit ausliefern, sonst landen bcrypt-Hash und
//   JWT-Signaturschlüssel in jeder Backup-Datei (die laut README ohnehin
//   Kalender-/Mail-Zugangsdaten im Klartext enthält – hier soll wenigstens
//   nicht zusätzlich die eigene Anmeldung mit exportiert werden).
// - Beim Restore nie übernehmen, sonst würde ein altes Backup das aktuelle
//   Passwort/den aktuellen Session-Schlüssel still zurücksetzen, oder eine
//   manipulierte Datei einen selbst gewählten JWT-Schlüssel einschleusen.
const EXCLUDED_SETTINGS_KEYS = ["auth.password_hash", "auth.jwt_secret", "auth.token_version"];

function buildBackup() {
  const settingsRows = db.prepare("SELECT key, value FROM settings").all();
  const settings = {};
  for (const row of settingsRows) {
    if (EXCLUDED_SETTINGS_KEYS.includes(row.key)) continue;
    settings[row.key] = row.value;
  }

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
    object_links: db.prepare("SELECT * FROM object_links").all(),
    week_reviews: db.prepare("SELECT * FROM week_reviews").all(),
    settings,
  };
}

// Prüft Struktur, Typen und Wertebereiche jeder Tabelle (siehe
// backupSchemas.js) sowie Bereichsreferenzen. Vorschau und Wiederherstellung
// verwenden exakt dieselbe Funktion, damit eine Datei, die die Vorschau
// besteht, beim tatsächlichen Restore nicht überraschend doch abgelehnt wird.
// Gibt bei Erfolg die bereinigten (auf die erwarteten Felder reduzierten)
// Tabellen zurück.
function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Datei ist kein gültiges Backup (kein JSON-Objekt)." };
  }
  if (!SUPPORTED_VERSIONS.includes(data.version)) {
    return { ok: false, error: `Nicht unterstützte Backup-Version (${data.version}).` };
  }

  const tablesToValidate = [...REQUIRED_TABLES];
  for (const { key, sinceVersion } of OPTIONAL_TABLES) {
    if (data.version >= sinceVersion) tablesToValidate.push(key);
  }

  const clean = {};
  for (const table of tablesToValidate) {
    if (!Array.isArray(data[table])) {
      return { ok: false, error: `Feld "${table}" fehlt oder ist keine Liste.` };
    }
    if (data[table].length > 200000) {
      return { ok: false, error: `Feld "${table}" enthält zu viele Einträge.` };
    }
    const result = validateTable(table, data[table]);
    if (!result.ok) return result;
    clean[table] = result.rows;
  }
  // Tabellen aus neueren, hier nicht unterstützten Versionen einfach nicht
  // mit übernehmen (bleiben unangetastet) statt sie ungeprüft durchzureichen.

  const settingsResult = validateSettings(data.settings);
  if (!settingsResult.ok) return settingsResult;
  clean.settings = settingsResult.settings;

  const areaIds = new Set(clean.areas.map((a) => a.id));
  if (areaIds.size !== clean.areas.length) {
    return { ok: false, error: "areas: doppelte Bereichs-ID im Backup." };
  }
  for (const table of tablesToValidate) {
    // health_entries hat bewusst keine Bereichs-Zuordnung (siehe README:
    // Gesundheitsdaten sind bereichsübergreifend) - ohne diesen Ausschluss
    // würde jede Zeile fälschlich als "Bereich undefined nicht definiert"
    // abgelehnt, weil healthEntrySchema kein area-Feld hat. object_links
    // verknüpft andere Objekte über deren eigene ID, hat selbst aber keinen
    // Bereich - dasselbe gilt hier. week_reviews fasst über alle Bereiche
    // hinweg zusammen (siehe README-Begründung bei health_entries).
    if (table === "areas" || table === "health_entries" || table === "object_links" || table === "week_reviews") continue;
    const dangling = findDanglingAreaRef(table, clean[table], areaIds);
    if (dangling) return { ok: false, error: dangling };
  }

  clean.version = data.version;
  clean.exported_at = typeof data.exported_at === "string" ? data.exported_at : null;
  return { ok: true, data: clean };
}

// Lädt das komplette lokale Backup als Datei herunter. Enthält weiterhin
// gespeicherte Kalender-/Mail-Zugangsdaten im Klartext (siehe README), aber
// nicht mehr den eigenen Passwort-Hash/JWT-Schlüssel (siehe oben) – die
// Datei sollte trotzdem sicher aufbewahrt werden (z. B. auf einem
// verschlüsselten Volume).
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
backupRouter.post("/preview", backupJsonParser, (req, res) => {
  const result = validateBackup(req.body?.data);
  if (!result.ok) return res.status(400).json({ valid: false, error: result.error });
  const { data } = result;

  res.json({
    valid: true,
    exported_at: data.exported_at,
    counts: {
      tasks: data.tasks.length,
      invoices: data.invoices.length,
      areas: data.areas.length,
      documents: data.documents?.length || 0,
      contracts: data.contracts?.length || 0,
      goals: data.goals?.length || 0,
      notes: data.notes?.length || 0,
      health_entries: data.health_entries?.length || 0,
      prompts: data.prompts?.length || 0,
      linkedin_posts: data.linkedin_posts?.length || 0,
      object_links: data.object_links?.length || 0,
      week_reviews: data.week_reviews?.length || 0,
      settings: Object.keys(data.settings).length,
    },
  });
});

// Ersetzt den kompletten lokalen Datenbestand durch den Inhalt des
// Backups. Erfordert confirm:true, damit ein versehentlicher Aufruf ohne
// vorherige Warnung im Frontend nicht möglich ist.
backupRouter.post("/restore", backupJsonParser, (req, res) => {
  const { data: rawData, confirm } = req.body || {};
  const result = validateBackup(rawData);
  if (!result.ok) return res.status(400).json({ error: result.error });
  if (confirm !== true) {
    return res.status(400).json({ error: "Bestätigung erforderlich (confirm: true) – überschreibt alle lokalen Daten." });
  }
  const data = result.data;

  const run = db.transaction(() => {
    // settings bewusst NICHT pauschal gelöscht: auth.* (Passwort-Hash,
    // JWT-Schlüssel, Session-Version) muss die aktuell laufende Anmeldung
    // überleben, siehe EXCLUDED_SETTINGS_KEYS oben. Alle anderen
    // Einstellungen werden gezielt ersetzt (nicht nur ergänzt), damit ein
    // Restore weiterhin ein vollständiger Zustandswechsel ist.
    db.exec("DELETE FROM tasks; DELETE FROM invoices; DELETE FROM areas;");
    const preserved = {};
    for (const key of EXCLUDED_SETTINGS_KEYS) {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      if (row) preserved[key] = row.value;
    }
    db.exec("DELETE FROM settings;");
    for (const [key, value] of Object.entries(preserved)) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
    }

    if (data.documents) db.exec("DELETE FROM documents;");
    if (data.contracts) db.exec("DELETE FROM contracts;");
    if (data.goals) db.exec("DELETE FROM goals;");
    if (data.notes) db.exec("DELETE FROM notes;");
    if (data.health_entries) db.exec("DELETE FROM health_entries;");
    if (data.prompts) db.exec("DELETE FROM prompts;");
    if (data.linkedin_posts) db.exec("DELETE FROM linkedin_posts;");
    if (data.object_links) db.exec("DELETE FROM object_links;");
    if (data.week_reviews) db.exec("DELETE FROM week_reviews;");

    const insertArea = db.prepare(
      "INSERT INTO areas (id, label, color, sort_order, is_default, archived, created_at, updated_at) VALUES (@id, @label, @color, @sort_order, @is_default, @archived, @created_at, @updated_at)",
    );
    for (const area of data.areas) insertArea.run(area);

    const insertTask = db.prepare(
      "INSERT INTO tasks (id, title, notes, due_date, priority, area, status, created_at, updated_at, recurrence) VALUES (@id, @title, @notes, @due_date, @priority, @area, @status, @created_at, @updated_at, @recurrence)",
    );
    for (const task of data.tasks) insertTask.run(task);

    const insertInvoice = db.prepare(
      `INSERT INTO invoices (id, mail_ref, sender, sender_name, subject, file_name, amount, due_date, area, status, received_at, created_at, updated_at, source, confirmed)
       VALUES (@id, @mail_ref, @sender, @sender_name, @subject, @file_name, @amount, @due_date, @area, @status, @received_at, @created_at, @updated_at, @source, @confirmed)`,
    );
    for (const invoice of data.invoices) insertInvoice.run(invoice);

    if (data.documents) {
      const insertDocument = db.prepare(
        `INSERT INTO documents (id, title, file_name, stored_name, mime_type, size, area, tags, created_at, updated_at)
         VALUES (@id, @title, @file_name, @stored_name, @mime_type, @size, @area, @tags, @created_at, @updated_at)`,
      );
      for (const document of data.documents) {
        insertDocument.run({ ...document, tags: typeof document.tags === "string" ? document.tags : JSON.stringify(document.tags) });
      }
    }

    if (data.contracts) {
      const insertContract = db.prepare(
        `INSERT INTO contracts (id, title, provider, area, cost, billing_cycle, cancellation_period_days, next_renewal_date, status, notes, created_at, updated_at)
         VALUES (@id, @title, @provider, @area, @cost, @billing_cycle, @cancellation_period_days, @next_renewal_date, @status, @notes, @created_at, @updated_at)`,
      );
      for (const contract of data.contracts) insertContract.run(contract);
    }

    if (data.goals) {
      const insertGoal = db.prepare(
        `INSERT INTO goals (id, title, description, area, target_date, status, progress, milestones, created_at, updated_at, review_freq, next_review_date)
         VALUES (@id, @title, @description, @area, @target_date, @status, @progress, @milestones, @created_at, @updated_at, @review_freq, @next_review_date)`,
      );
      for (const goal of data.goals) {
        insertGoal.run({ ...goal, milestones: typeof goal.milestones === "string" ? goal.milestones : JSON.stringify(goal.milestones) });
      }
    }

    if (data.notes) {
      const insertNote = db.prepare(
        `INSERT INTO notes (id, title, content, area, tags, pinned, created_at, updated_at)
         VALUES (@id, @title, @content, @area, @tags, @pinned, @created_at, @updated_at)`,
      );
      for (const note of data.notes) {
        insertNote.run({ ...note, tags: typeof note.tags === "string" ? note.tags : JSON.stringify(note.tags) });
      }
    }

    if (data.health_entries) {
      const insertHealthEntry = db.prepare(
        `INSERT INTO health_entries (id, entry_date, type, value, unit, note, created_at, updated_at)
         VALUES (@id, @entry_date, @type, @value, @unit, @note, @created_at, @updated_at)`,
      );
      for (const entry of data.health_entries) insertHealthEntry.run(entry);
    }

    if (data.prompts) {
      const insertPrompt = db.prepare(
        `INSERT INTO prompts (id, title, content, area, tags, pinned, created_at, updated_at)
         VALUES (@id, @title, @content, @area, @tags, @pinned, @created_at, @updated_at)`,
      );
      for (const prompt of data.prompts) {
        insertPrompt.run({ ...prompt, tags: typeof prompt.tags === "string" ? prompt.tags : JSON.stringify(prompt.tags) });
      }
    }

    if (data.linkedin_posts) {
      const insertPost = db.prepare(
        `INSERT INTO linkedin_posts (id, content, area, status, scheduled_date, created_at, updated_at)
         VALUES (@id, @content, @area, @status, @scheduled_date, @created_at, @updated_at)`,
      );
      for (const post of data.linkedin_posts) insertPost.run(post);
    }

    // Nach allen anderen Tabellen, damit die verknüpften Objekte (auf die
    // a_id/b_id zeigen) beim Wiederherstellen bereits existieren - relevant
    // nur für die Lesbarkeit des Restores, da object_links keinen echten
    // FK-Constraint hat (siehe Migration 0015).
    if (data.object_links) {
      const insertLink = db.prepare(
        `INSERT INTO object_links (id, a_type, a_id, b_type, b_id, created_at)
         VALUES (@id, @a_type, @a_id, @b_type, @b_id, @created_at)`,
      );
      for (const link of data.object_links) insertLink.run(link);
    }

    if (data.week_reviews) {
      const insertReview = db.prepare(
        `INSERT INTO week_reviews (id, week_start, closed_at, summary) VALUES (@id, @week_start, @closed_at, @summary)`,
      );
      for (const review of data.week_reviews) {
        insertReview.run({ ...review, summary: typeof review.summary === "string" ? review.summary : JSON.stringify(review.summary) });
      }
    }

    for (const [key, value] of Object.entries(data.settings)) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
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
