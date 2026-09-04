import { Router } from "express";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { TASK_PRIORITIES as PRIORITIES, TASK_STATUSES as STATUSES } from "../constants.js";

export const tasksRouter = Router();

function validateTaskInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      errors.push("Titel ist erforderlich.");
    } else {
      data.title = body.title.trim();
    }
  }
  if (body.due_date !== undefined) data.due_date = body.due_date || null;
  if (body.notes !== undefined) data.notes = body.notes || "";
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) errors.push("Ungültige Priorität.");
    else data.priority = body.priority;
  }
  if (body.area !== undefined) {
    if (!isValidArea(body.area)) errors.push("Ungültiger Bereich.");
    else data.area = body.area;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push("Ungültiger Status.");
    else data.status = body.status;
  }

  return { data, errors };
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
