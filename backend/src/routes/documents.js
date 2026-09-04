import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { getDocumentsDir, generateStoredName } from "../documentStorage.js";

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
  const clauses = [];
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
  const info = stmt.run({
    title: (req.body.title || req.file.originalname || "Dokument").trim(),
    file_name: req.file.originalname,
    stored_name: req.file.filename,
    mime_type: req.file.mimetype || "",
    size: req.file.size,
    area,
    tags: JSON.stringify(tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())),
  });

  res.status(201).json(serialize(db.prepare("SELECT * FROM documents WHERE id = ?").get(info.lastInsertRowid)));
});

documentsRouter.get("/:id/download", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden." });

  const filePath = path.join(getDocumentsDir(), doc.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei fehlt auf der Platte (wurde außerhalb der App gelöscht?)." });
  }
  res.download(filePath, doc.file_name);
});

documentsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
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
  const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden." });

  db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
  const filePath = path.join(getDocumentsDir(), doc.stored_name);
  fs.unlink(filePath, () => {});

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
