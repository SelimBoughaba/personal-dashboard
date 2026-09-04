import { Router } from "express";
import { db, isValidArea, getDefaultAreaId } from "../db.js";

export const linkedinPostsRouter = Router();

const STATUSES = ["entwurf", "geplant", "veroeffentlicht"];

function validateInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.content !== undefined) {
    if (!body.content || !body.content.trim()) errors.push("Text ist erforderlich.");
    else data.content = body.content;
  }
  if (body.area !== undefined) {
    if (!isValidArea(body.area)) errors.push("Ungültiger Bereich.");
    else data.area = body.area;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push("Ungültiger Status.");
    else data.status = body.status;
  }
  if (body.scheduled_date !== undefined) data.scheduled_date = body.scheduled_date || null;

  return { data, errors };
}

linkedinPostsRouter.get("/", (req, res) => {
  const { status } = req.query;
  let query = "SELECT * FROM linkedin_posts";
  const params = [];
  if (status && status !== "alle") {
    query += " WHERE status = ?";
    params.push(status);
  }
  query += " ORDER BY scheduled_date IS NULL, scheduled_date ASC, created_at DESC";
  res.json(db.prepare(query).all(...params));
});

linkedinPostsRouter.post("/", (req, res) => {
  const { data, errors } = validateInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const stmt = db.prepare(`
    INSERT INTO linkedin_posts (content, area, status, scheduled_date)
    VALUES (@content, @area, @status, @scheduled_date)
  `);
  const info = stmt.run({
    content: data.content,
    area: data.area ?? getDefaultAreaId(),
    status: data.status ?? "entwurf",
    scheduled_date: data.scheduled_date ?? null,
  });

  res.status(201).json(db.prepare("SELECT * FROM linkedin_posts WHERE id = ?").get(info.lastInsertRowid));
});

linkedinPostsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM linkedin_posts WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Beitrag nicht gefunden." });

  const { data, errors } = validateInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const merged = { ...existing, ...data, id: req.params.id };
  db.prepare(`
    UPDATE linkedin_posts SET content=@content, area=@area, status=@status, scheduled_date=@scheduled_date, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(db.prepare("SELECT * FROM linkedin_posts WHERE id = ?").get(req.params.id));
});

linkedinPostsRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM linkedin_posts WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Beitrag nicht gefunden." });
  res.status(204).send();
});
