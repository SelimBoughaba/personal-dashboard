import { Router } from "express";
import { z } from "zod";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { TASK_PRIORITIES as PRIORITIES, TASK_STATUSES as STATUSES } from "../constants.js";
import { validateWithSchema, optionalNullableDateString, optionalTextDefaultEmpty } from "../validation.js";

export const tasksRouter = Router();

const taskSchema = z.object({
  title: z
    .string({ required_error: "Titel ist erforderlich.", invalid_type_error: "Titel ist erforderlich." })
    .trim()
    .min(1, "Titel ist erforderlich."),
  due_date: optionalNullableDateString,
  notes: optionalTextDefaultEmpty,
  priority: z.enum(PRIORITIES, { errorMap: () => ({ message: "Ungültige Priorität." }) }).optional(),
  area: z
    .string()
    .refine((v) => isValidArea(v), { message: "Ungültiger Bereich." })
    .optional(),
  status: z.enum(STATUSES, { errorMap: () => ({ message: "Ungültiger Status." }) }).optional(),
});

function validateTaskInput(body, options) {
  return validateWithSchema(taskSchema, body, options);
}

// GET /api/tasks?area=evermont&sort=priority
tasksRouter.get("/", (req, res) => {
  const { area, sort } = req.query;
  let query = "SELECT * FROM tasks";
  const params = [];

  if (area && area !== "alle") {
    query += " WHERE area = ?";
    params.push(area);
  }

  if (sort === "priority") {
    query += ` ORDER BY CASE priority WHEN 'hoch' THEN 0 WHEN 'mittel' THEN 1 ELSE 2 END, due_date IS NULL, due_date ASC`;
  } else {
    query += " ORDER BY due_date IS NULL, due_date ASC, CASE priority WHEN 'hoch' THEN 0 WHEN 'mittel' THEN 1 ELSE 2 END";
  }

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

tasksRouter.post("/", (req, res) => {
  const { data, errors } = validateTaskInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const stmt = db.prepare(`
    INSERT INTO tasks (title, notes, due_date, priority, area, status)
    VALUES (@title, @notes, @due_date, @priority, @area, @status)
  `);
  const info = stmt.run({
    title: data.title,
    notes: data.notes ?? "",
    due_date: data.due_date ?? null,
    priority: data.priority ?? "mittel",
    area: data.area ?? getDefaultAreaId(),
    status: "offen",
  });

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(task);
});

tasksRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Aufgabe nicht gefunden." });

  const { data, errors } = validateTaskInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const merged = { ...existing, ...data };
  db.prepare(`
    UPDATE tasks SET title=@title, notes=@notes, due_date=@due_date,
      priority=@priority, area=@area, status=@status, updated_at=datetime('now')
    WHERE id=@id
  `).run({ ...merged, id: req.params.id });

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  res.json(task);
});

tasksRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Aufgabe nicht gefunden." });
  res.status(204).send();
});
