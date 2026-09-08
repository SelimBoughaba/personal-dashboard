import { Router } from "express";
import fs from "node:fs";
import multer from "multer";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { getDocumentsDir, generateStoredName, resolveStoredDocumentPath } from "../documentStorage.js";

export const documentsRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, getDocumentsDir());
    },
    filename(req, file, cb) {
      cb(null, generateStoredName(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serialize(row) {
  return { ...row, tags: parseTags(row.tags) };
}

documentsRouter.get("/", (req, res) => {
  const { area, tag, q } = req.query;
  let query = "SELECT * FROM documents";
  const clauses = ["deleted_at IS NULL"];
  const params = [];

  if (area && area !== "alle") {
    clauses.push("area = ?");
    params.push(area);
  }
  if (tag) {
    clauses.push("tags LIKE ?");
    params.push(`%"${tag}"%`);
  }
  if (q) {
    clauses.push("(title LIKE ? OR file_name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (clauses.length) query += " WHERE " + clauses.join(" AND ");
  query += " ORDER BY created_at DESC";

  res.json(db.prepare(query).all(...params).map(serialize));
});

documentsRouter.post("/", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Keine Datei übermittelt." });

  const area = req.body.area || getDefaultAreaId();
  if (!isValidArea(area)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "Ungültiger Bereich." });
  }

  let tags = [];
  try {
    tags = req.body.tags ? JSON.parse(req.body.tags) : [];
    if (!Array.isArray(tags)) tags = [];
  } catch {
    tags = [];
  }

  const stmt = db.prepare(`
    INSERT INTO documents (title, file_name, stored_name, mime_type, size, area, tags)
    VALUES (@title, @file_name, @stored_name, @mime_type, @size, @area, @tags)
  `);

  let info;
  try {
    info = stmt.run({
      title: (req.body.title || req.file.originalname || "Dokument").trim(),
      file_name: req.file.originalname,
      stored_name: req.file.filename,
      mime_type: req.file.mimetype || "",
      size: req.file.size,
      area,
      tags: JSON.stringify(tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())),
    });
  } catch (err) {
    // multer hat die Datei bereits auf die Platte geschrieben, bevor dieser
    // Handler lief. Schlägt der DB-Insert fehl (z. B. eine künftige
    // Constraint-Verletzung), bliebe ohne diesen Block eine Datei ohne
    // jeden Datenbankeintrag auf der Platte liegen - nie auffindbar, nie
    // löschbar über die App.
    fs.unlink(req.file.path, () => {});
    console.error("Dokument-Upload: DB-Insert fehlgeschlagen, hochgeladene Datei entfernt:", err);
    return res.status(500).json({ error: "Dokument konnte nicht gespeichert werden." });
  }

  res.status(201).json(serialize(db.prepare("SELECT * FROM documents WHERE id = ?").get(info.lastInsertRowid)));
});

documentsRouter.get("/:id/download", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden." });

  // stored_name kommt aus der DB, nicht direkt vom Client – trotzdem wird
  // hier erneut geprüft (Format + tatsächliches Enthaltensein im
  // konfigurierten Speicherordner), statt der Datenbank blind zu vertrauen.
  // Ein manipulierter oder wiederhergestellter Datensatz mit unerwartetem
  // stored_name darf nie zu einem Dateizugriff außerhalb des Ordners führen.
  const filePath = resolveStoredDocumentPath(doc.stored_name);
  if (!filePath) {
    console.error(`Dokument ${doc.id}: ungültiger stored_name "${doc.stored_name}", Download verweigert.`);
    return res.status(500).json({ error: "Dokument ist beschädigt (ungültiger Dateiverweis)." });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei fehlt auf der Platte (wurde außerhalb der App gelöscht?)." });
  }
  res.download(filePath, doc.file_name);
});

documentsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Dokument nicht gefunden." });

  const body = req.body || {};
  if (body.area !== undefined && !isValidArea(body.area)) {
    return res.status(400).json({ error: "Ungültiger Bereich." });
  }

  const merged = {
    id: req.params.id,
    title: body.title !== undefined ? String(body.title).trim() || existing.title : existing.title,
    area: body.area ?? existing.area,
    tags:
      body.tags !== undefined
        ? JSON.stringify(Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string" && t.trim()) : [])
        : existing.tags,
  };

  db.prepare(`
    UPDATE documents SET title=@title, area=@area, tags=@tags, updated_at=datetime('now') WHERE id=@id
  `).run(merged);

  res.json(serialize(db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id)));
});

documentsRouter.delete("/:id", (req, res) => {
  // Papierkorb (Punkt 77): Soft-Delete statt echtem DELETE - die Datei
  // bleibt bewusst auf der Platte liegen (siehe trash.js), solange der
  // Datensatz wiederherstellbar ist. Nur das endgültige Löschen im
  // Papierkorb (routes/trash.js) entfernt die Datei wirklich.
  const info = db
    .prepare("UPDATE documents SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Dokument nicht gefunden." });
  res.status(204).send();
});

// Multer-Fehler (z. B. Datei zu groß) landen sonst in der generischen
// 500er-Fehlerbehandlung ohne hilfreiche Meldung.
documentsRouter.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload fehlgeschlagen: ${err.message}` });
  }
  next(err);
});
