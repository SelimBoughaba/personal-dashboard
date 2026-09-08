import { Router } from "express";
import { db } from "../db.js";
import { LINK_OBJECT_TABLES, LINK_OBJECT_TYPES } from "../constants.js";

export const linksRouter = Router();

function isValidType(type) {
  return Object.prototype.hasOwnProperty.call(LINK_OBJECT_TABLES, type);
}

function existsById(type, id) {
  const { table } = LINK_OBJECT_TABLES[type];
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);
}

// GET /api/links?type=aufgabe&id=5 - alle Verknüpfungen eines Objekts, mit
// nachgeladenem Titel des jeweils anderen Objekts (spart dem Frontend einen
// Request pro Chip). Ein inzwischen gelöschtes verlinktes Objekt wird
// stillschweigend nicht mehr angezeigt statt eines kaputten Chips - die
// verwaiste Zeile in object_links bleibt bestehen (harmlos, siehe DELETE
// unten für die einzige Möglichkeit, eine Verknüpfung selbst zu entfernen).
linksRouter.get("/", (req, res) => {
  const { type, id } = req.query;
  if (!isValidType(type) || !id || !Number.isInteger(Number(id))) {
    return res.status(400).json({ error: "Ungültiger Objekttyp oder fehlende ID." });
  }
  const rows = db
    .prepare(
      `SELECT * FROM object_links WHERE (a_type = ? AND a_id = ?) OR (b_type = ? AND b_id = ?) ORDER BY created_at DESC`,
    )
    .all(type, id, type, id);

  const results = rows
    .map((row) => {
      const isA = row.a_type === type && String(row.a_id) === String(id);
      const otherType = isA ? row.b_type : row.a_type;
      const otherId = isA ? row.b_id : row.a_id;
      const def = LINK_OBJECT_TABLES[otherType];
      if (!def) return null; // Typ aus einer neueren Version, hier unbekannt
      const other = db.prepare(`SELECT id, ${def.titleColumn} AS title FROM ${def.table} WHERE id = ?`).get(otherId);
      if (!other) return null; // verlinktes Objekt wurde gelöscht
      return { linkId: row.id, type: otherType, id: other.id, title: other.title || "(ohne Titel)" };
    })
    .filter(Boolean);

  res.json(results);
});

// POST /api/links { a_type, a_id, b_type, b_id } - Beziehung sichtbar und
// manuell gesetzt (Punkt 69), keine automatische Ableitung/Heuristik.
linksRouter.post("/", (req, res) => {
  const { a_type, a_id, b_type, b_id } = req.body || {};
  if (!isValidType(a_type) || !isValidType(b_type) || !Number.isInteger(Number(a_id)) || !Number.isInteger(Number(b_id))) {
    return res.status(400).json({ error: "Ungültige Verknüpfung." });
  }
  if (a_type === b_type && Number(a_id) === Number(b_id)) {
    return res.status(400).json({ error: "Ein Objekt kann nicht mit sich selbst verknüpft werden." });
  }
  if (!existsById(a_type, a_id) || !existsById(b_type, b_id)) {
    return res.status(404).json({ error: "Eines der verknüpften Objekte existiert nicht." });
  }
  const existing = db
    .prepare(
      `SELECT id FROM object_links
       WHERE (a_type = ? AND a_id = ? AND b_type = ? AND b_id = ?)
          OR (a_type = ? AND a_id = ? AND b_type = ? AND b_id = ?)`,
    )
    .get(a_type, a_id, b_type, b_id, b_type, b_id, a_type, a_id);
  if (existing) return res.status(200).json({ id: existing.id });

  const info = db
    .prepare(`INSERT INTO object_links (a_type, a_id, b_type, b_id) VALUES (?, ?, ?, ?)`)
    .run(a_type, a_id, b_type, b_id);
  res.status(201).json({ id: info.lastInsertRowid });
});

linksRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM object_links WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Verknüpfung nicht gefunden." });
  res.status(204).send();
});

// Für das Frontend (Typ-Auswahl im "+ Verknüpfen"-Picker), damit die Liste
// erlaubter Typen nicht doppelt gepflegt werden muss.
linksRouter.get("/types", (req, res) => {
  res.json(LINK_OBJECT_TYPES);
});
