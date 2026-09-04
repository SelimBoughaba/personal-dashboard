import { Router } from "express";
import { db, isValidArea, getDefaultAreaId } from "../db.js";

export const notesRouter = Router();

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serialize(row) {
  return { ...row, tags: parseTags(row.tags), pinned: !!row.pinned };
}

function cleanTags(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
}

notesRouter.get("/", (req, res) => {
  const { area, tag, q } = req.query;
  let query = "SELECT * FROM notes";
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
    clauses.push("(title LIKE ? OR content LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (clauses.length) query += " WHERE " + clauses.join(" AND ");
  query += " ORDER BY pinned DESC, updated_at DESC";

  res.json(db.prepare(query).all(...params).map(serialize));
});

notesRouter.post("/", (req, res) => {
  const body = req.body || {};
  const area = body.area || getDefaultAreaId();
  if (!isValidArea(area)) return res.status(400).json({ error: "Ungültiger Bereich." });
  if (!body.title?.trim() && !body.content?.trim()) {
    return res.status(400).json({ error: "Titel oder Inhalt ist erforderlich." });
  }

  const stmt = db.prepare(`
    INSERT INTO notes (title, content, area, tags, pinned)
    VALUES (@title, @content, @area, @tags, @pinned)
  `);
  const info = stmt.run({
    title: (body.title || "").trim(),
    content: body.content || "",
    area,
    tags: JSON.stringify(cleanTags(body.tags)),
    pinned: body.pinned ? 1 : 0,
  });

  res.status(201).json(serialize(db.prepare("SELECT * FROM notes WHERE id = ?").get(info.lastInsertRowid)));
});

notesRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Notiz nicht gefunden." });

  const body = req.body || {};
  if (body.area !== undefined && !isValidArea(body.area)) {
    return res.status(400).json({ error: "Ungültiger Bereich." });
  }

  const merged = {
    id: req.params.id,
    title: body.title !== undefined ? body.title.trim() : existing.title,
    content: body.content !== undefined ? body.content : existing.content,
    area: body.area ?? existing.area,
    tags: body.tags !== undefined ? JSON.stringify(cleanTags(body.tags)) : existing.tags,
    pinned: body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned,
  };

  db.prepare(`
    UPDATE notes SET title=@title, content=@content, area=@area, tags=@tags, pinned=@pinned, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(serialize(db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id)));
});

notesRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Notiz nicht gefunden." });
  res.status(204).send();
});
