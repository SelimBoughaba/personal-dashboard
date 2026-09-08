// Vertrauens- und Einrichtungsbereich (Punkt 80): "Eine verständliche Seite
// zeigt Speicherort, letzte verifizierte Sicherung, Integrationszustand,
// Datenfrische, aktive Berechtigungen und ausstehende lokale Jobs. [...]
// Keine grünen Sicherheitsversprechen ohne zugrundeliegende Prüfung."
//
// Jeder hier gemeldete Zustand hat eine echte Grundlage:
//   - Speicherort: die tatsächlich verwendeten Pfade (db.js/documentStorage.js).
//   - Sicherung: nur "verifiziert", wenn der zuletzt erzeugte Export
//     tatsächlich durch dieselbe strikte Validierung lief wie ein Restore
//     (siehe routes/backup.js) - nicht nur, weil ein Download angestoßen wurde.
//   - Kalender: LIVE geprüft bei jedem Abruf dieser Seite (wie schon beim
//     Wochenrückblick/Benachrichtigungszentrum) - echte Verbindung, kein
//     geratener Zustand.
//   - Mail: bewusst KEIN Live-Test (siehe notifications.js-Begründung: ein
//     IMAP-Scan hat Seiteneffekte und darf nicht durch das bloße Öffnen
//     dieser Seite ausgelöst werden) - nur der zuletzt tatsächlich
//     aufgetretene Fehler wird gemeldet, nie ein unbelegtes "verbunden".
//   - Ausstehende lokale Jobs: es gibt keinen Hintergrunddienst/Cron in
//     dieser App (bewusste Architekturentscheidung, siehe README) - jede
//     Prüfung läuft lazy beim jeweiligen Abruf. Die ehrliche Antwort ist
//     "keine", mit Begründung statt einer erfundenen Warteschlange.

import fs from "node:fs";
import { db, dataDir } from "./db.js";
import { getSetting, getIcloudConfig, getMailAccounts } from "./configStore.js";
import { getDocumentsDir } from "./documentStorage.js";
import { configuredMailAccounts } from "./mailAccounts.js";
import { checkCalendarConnection } from "./notifications.js";
import { TRASH_TABLES } from "./constants.js";

function dirSizeBytes(dirPath) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = `${dirPath}/${entry.name}`;
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else {
      try {
        total += fs.statSync(full).size;
      } catch {
        // Datei zwischen readdir und stat verschwunden - überspringen statt abzubrechen.
      }
    }
  }
  return total;
}

function latestIntegrationEvent(key) {
  return db.prepare(`SELECT title, body, created_at FROM notification_events WHERE key = ?`).get(key) || null;
}

async function calendarStatus() {
  const configured = !!getIcloudConfig();
  if (!configured) return { configured: false, ok: null, error: null, lastCheckedAt: null };

  await checkCalendarConnection(); // echter Verbindungsversuch, aktualisiert notification_events
  const error = latestIntegrationEvent("error:calendar");
  const checkedAt = new Date().toISOString();
  return {
    configured: true,
    ok: !error,
    error: error ? error.body || error.title : null,
    lastCheckedAt: checkedAt,
  };
}

function mailStatus() {
  const accounts = getMailAccounts();
  const configured = accounts.length > 0;
  const activeCount = configuredMailAccounts().length;
  if (!configured) return { configured: false, accountCount: 0, activeCount: 0, lastError: null, lastErrorAt: null };

  const error = latestIntegrationEvent("error:mail");
  return {
    configured: true,
    accountCount: accounts.length,
    activeCount,
    lastError: error ? error.body || error.title : null,
    lastErrorAt: error ? error.created_at : null,
  };
}

function dataFreshness() {
  const seen = new Set();
  const rows = [];
  for (const def of Object.values(TRASH_TABLES)) {
    if (seen.has(def.table)) continue; // z.B. falls je zwei Typen dieselbe Tabelle teilen sollten
    seen.add(def.table);
    const row = db.prepare(`SELECT MAX(updated_at) AS lastUpdatedAt, COUNT(*) AS count FROM ${def.table} WHERE deleted_at IS NULL`).get();
    rows.push({ label: def.label, table: def.table, lastUpdatedAt: row.lastUpdatedAt, count: row.count });
  }
  return rows.sort((a, b) => (b.lastUpdatedAt || "").localeCompare(a.lastUpdatedAt || ""));
}

export async function computeTrustStatus() {
  const documentsDir = getDocumentsDir();
  let databaseSizeBytes = 0;
  try {
    databaseSizeBytes = fs.statSync(`${dataDir}/dashboard.db`).size;
  } catch {
    databaseSizeBytes = 0;
  }

  const calendar = await calendarStatus();

  return {
    generatedAt: new Date().toISOString(),
    storage: {
      dataDir,
      documentsDir,
      databaseSizeBytes,
      documentsSizeBytes: dirSizeBytes(documentsDir),
    },
    backup: {
      lastVerifiedAt: getSetting("trust.last_backup_verified_at", null),
    },
    integrations: {
      calendar,
      mail: mailStatus(),
    },
    dataFreshness: dataFreshness(),
    pendingJobs: {
      count: 0,
      note:
        "Kein Hintergrunddienst: Fristenradar, Papierkorb-Bereinigung, finanzieller Ausblick und Wochenrückblick laufen bedarfsgesteuert beim jeweiligen Seitenaufruf, nicht nach Zeitplan.",
    },
  };
}
