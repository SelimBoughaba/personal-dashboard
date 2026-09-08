import { Router } from "express";
import { z } from "zod";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { validateWithSchema, optionalNullableDateString } from "../validation.js";

export const linkedinPostsRouter = Router();

const STATUSES = ["entwurf", "geplant", "veroeffentlicht"];

const linkedinPostSchema = z.object({
  // Bewusst NICHT getrimmt gespeichert (anders als z. B. Aufgaben-/
  // Ziel-Titel) - entspricht dem bisherigen Verhalten, das den Inhalt
  // unverändert übernahm. Vorher konnte ein nicht-String-Wert (z. B. eine
  // Zahl) hier zu einem ungefangenen TypeError bei body.content.trim()
  // führen (500 statt 400) - z.string() lehnt das jetzt sauber ab.
  content: z
    .string({ required_error: "Text ist erforderlich.", invalid_type_error: "Text ist erforderlich." })
    .refine((v) => v.trim().length > 0, { message: "Text ist erforderlich." }),
  area: z
    .string()
    .refine((v) => isValidArea(v), { message: "Ungültiger Bereich." })
    .optional(),
  status: z.enum(STATUSES, { errorMap: () => ({ message: "Ungültiger Status." }) }).optional(),
  scheduled_date: optionalNullableDateString,
});

function validateInput(body, options) {
  return validateWithSchema(linkedinPostSchema, body, options);
}

linkedinPostsRouter.get("/", (req, res) => {
  const { status } = req.query;
  let query = "SELECT * FROM linkedin_posts WHERE deleted_at IS NULL";
  const params = [];
  if (status && status !== "alle") {
    query += " AND status = ?";
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
  const existing = db.prepare("SELECT * FROM linkedin_posts WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
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
  // Papierkorb (Punkt 77): Soft-Delete statt echtem DELETE, siehe trash.js.
  const info = db
    .prepare("UPDATE linkedin_posts SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Beitrag nicht gefunden." });
  res.status(204).send();
});
