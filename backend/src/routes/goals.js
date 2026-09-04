import { Router } from "express";
import crypto from "node:crypto";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { GOAL_STATUSES as STATUSES } from "../constants.js";

export const goalsRouter = Router();

function parseMilestones(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sanitizeMilestones(input) {
  if (!Array.isArray(input)) return null;
  const clean = [];
  for (const m of input) {
    if (!m || typeof m !== "object" || typeof m.text !== "string" || !m.text.trim()) return null;
    clean.push({ id: typeof m.id === "string" && m.id ? m.id : crypto.randomUUID(), text: m.text.trim(), done: !!m.done });
  }
  return clean;
}

// Fortschritt wird aus Meilensteinen berechnet, sobald welche vorhanden
// sind - so bleibt der Wert immer ehrlich (kein manuell gesetzter Prozent-
// wert, der nicht mehr zum Haken-Status der Meilensteine passt). Ohne
// Meilensteine bleibt Fortschritt manuell setzbar.
function computeProgress(milestones, manualProgress) {
  if (milestones.length > 0) {
    const done = milestones.filter((m) => m.done).length;
    return Math.round((done / milestones.length) * 100);
  }
  const value = Number(manualProgress);
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function serialize(row) {
  return { ...row, milestones: parseMilestones(row.milestones) };
}

function validateGoalInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      errors.push("Titel ist erforderlich.");
    } else {
      data.title = body.title.trim();
    }
  }
  if (body.description !== undefined) data.description = body.description || "";
  if (body.target_date !== undefined) data.target_date = body.target_date || null;
  if (body.area !== undefined) {
    if (!isValidArea(body.area)) errors.push("Ungültiger Bereich.");
    else data.area = body.area;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push("Ungültiger Status.");
    else data.status = body.status;
  }
  if (body.milestones !== undefined) {
    const clean = sanitizeMilestones(body.milestones);
    if (clean === null) errors.push("Ungültige Meilensteine.");
    else data.milestones = clean;
  }
  if (body.progress !== undefined) data.manualProgress = body.progress;

  return { data, errors };
}

goalsRouter.get("/", (req, res) => {
  const { area, status } = req.query;
  let query = "SELECT * FROM goals";
  const clauses = [];
  const params = [];

  if (area && area !== "alle") {
    clauses.push("area = ?");
    params.push(area);
  }
  if (status && status !== "alle") {
    clauses.push("status = ?");
    params.push(status);
  }
  if (clauses.length) query += " WHERE " + clauses.join(" AND ");
  query += " ORDER BY target_date IS NULL, target_date ASC, created_at DESC";

  res.json(db.prepare(query).all(...params).map(serialize));
});

goalsRouter.post("/", (req, res) => {
  const { data, errors } = validateGoalInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const milestones = data.milestones ?? [];
  const progress = computeProgress(milestones, data.manualProgress ?? 0);

  const stmt = db.prepare(`
    INSERT INTO goals (title, description, area, target_date, status, progress, milestones)
    VALUES (@title, @description, @area, @target_date, @status, @progress, @milestones)
  `);
  const info = stmt.run({
    title: data.title,
    description: data.description ?? "",
    area: data.area ?? getDefaultAreaId(),
    target_date: data.target_date ?? null,
    status: data.status ?? "aktiv",
    progress,
    milestones: JSON.stringify(milestones),
  });

  res.status(201).json(serialize(db.prepare("SELECT * FROM goals WHERE id = ?").get(info.lastInsertRowid)));
});

goalsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Ziel nicht gefunden." });

  const { data, errors } = validateGoalInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const milestones = data.milestones ?? parseMilestones(existing.milestones);
  const manualProgress = data.manualProgress ?? existing.progress;
  const progress = computeProgress(milestones, manualProgress);

  const merged = {
    id: req.params.id,
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    area: data.area ?? existing.area,
    target_date: data.target_date === undefined ? existing.target_date : data.target_date,
    status: data.status ?? existing.status,
    progress,
    milestones: JSON.stringify(milestones),
  };

  db.prepare(`
    UPDATE goals SET title=@title, description=@description, area=@area, target_date=@target_date,
      status=@status, progress=@progress, milestones=@milestones, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(serialize(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM goals WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Ziel nicht gefunden." });
  res.status(204).send();
});
