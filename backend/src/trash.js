// Papierkorb (Punkt 77 der Design-Erweiterung): "versehentlich Gelöschtes
// innerhalb einer erklärten Frist zurückholen". Löschen auf den acht
// TRASH_TABLES (siehe constants.js) setzt seitdem nur noch deleted_at statt
// die Zeile wirklich zu entfernen - jede betroffene Route filtert aktive
// Abfragen (GET-Listen, PATCH/DELETE-Lookups) zusätzlich mit
// "deleted_at IS NULL", damit eine im Papierkorb liegende Zeile überall
// sonst wie gelöscht wirkt, bis sie wiederhergestellt wird.
//
// "Papierkorb auch für verknüpfte Dateien konsistent": bei Dokumenten bleibt
// die Datei auf der Platte liegen, solange die Zeile im Papierkorb ist -
// erst restorePurge()/purgeOne() beim endgültigen Löschen entfernt sie
// wirklich (siehe unten).
//
// "Endgültiges Löschen und Backups haben getrennte Aufbewahrungsregeln":
// ein Backup (routes/backup.js) exportiert den Datenbestand unverändert
// inkl. deleted_at - der Papierkorb-Ablauf hier hat keinerlei Einfluss auf
// bereits existierende Backup-Dateien, und ein Restore stellt auch den
// Papierkorb-Zustand zum Zeitpunkt des Backups wieder her.

import fs from "node:fs";
import { db } from "./db.js";
import { TRASH_TABLES, TRASH_RETENTION_DAYS } from "./constants.js";
import { resolveStoredDocumentPath } from "./documentStorage.js";

function purgeDocumentFile(row) {
  const filePath = resolveStoredDocumentPath(row.stored_name);
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error(`Papierkorb: Datei zu Dokument ${row.id} konnte nicht entfernt werden:`, err);
    }
  });
}

// Kein Hintergrunddienst/Cron (bewusst, siehe zurückgestellte Backend-
// Fundamente): läuft stattdessen "lazy" bei jedem Abruf des Papierkorbs mit,
// genau wie schon computeWeek() im Wochenrückblick live rechnet statt auf
// einen Zeitplan zu warten.
export function purgeExpired() {
  for (const [type, def] of Object.entries(TRASH_TABLES)) {
    if (def.table === "documents") {
      const expired = db
        .prepare(`SELECT id, stored_name FROM documents WHERE deleted_at IS NOT NULL AND deleted_at <= datetime('now', ?)`)
        .all(`-${TRASH_RETENTION_DAYS} days`);
      for (const row of expired) purgeDocumentFile(row);
      db.prepare(`DELETE FROM documents WHERE deleted_at IS NOT NULL AND deleted_at <= datetime('now', ?)`).run(
        `-${TRASH_RETENTION_DAYS} days`,
      );
      continue;
    }
    db.prepare(`DELETE FROM ${def.table} WHERE deleted_at IS NOT NULL AND deleted_at <= datetime('now', ?)`).run(
      `-${TRASH_RETENTION_DAYS} days`,
    );
  }
}

function truncate(text, max = 120) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function listTrash() {
  purgeExpired();
  const items = [];
  for (const [type, def] of Object.entries(TRASH_TABLES)) {
    const rows = db
      .prepare(`SELECT id, ${def.titleColumn} AS title, deleted_at FROM ${def.table} WHERE deleted_at IS NOT NULL`)
      .all();
    for (const row of rows) {
      items.push({
        type,
        id: row.id,
        label: def.label,
        title: truncate(row.title) || "(ohne Titel)",
        deletedAt: row.deleted_at,
        purgeAt: db.prepare(`SELECT datetime(?, ?) AS d`).get(row.deleted_at, `+${TRASH_RETENTION_DAYS} days`).d,
      });
    }
  }
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return items;
}

export function restoreFromTrash(type, id) {
  const def = TRASH_TABLES[type];
  if (!def) return { ok: false, status: 400, error: "Ungültiger Objekttyp." };
  const info = db.prepare(`UPDATE ${def.table} SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  if (info.changes === 0) return { ok: false, status: 404, error: "Eintrag nicht im Papierkorb gefunden." };
  return { ok: true };
}

export function purgeOne(type, id) {
  const def = TRASH_TABLES[type];
  if (!def) return { ok: false, status: 400, error: "Ungültiger Objekttyp." };

  if (def.table === "documents") {
    const row = db.prepare(`SELECT id, stored_name FROM documents WHERE id = ? AND deleted_at IS NOT NULL`).get(id);
    if (!row) return { ok: false, status: 404, error: "Eintrag nicht im Papierkorb gefunden." };
    purgeDocumentFile(row);
  }

  const info = db.prepare(`DELETE FROM ${def.table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  if (info.changes === 0) return { ok: false, status: 404, error: "Eintrag nicht im Papierkorb gefunden." };
  return { ok: true };
}
