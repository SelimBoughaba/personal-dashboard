import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { GOAL_STATUSES as STATUSES } from "../constants.js";
import { validateWithSchema, optionalNullableDateString, optionalTextDefaultEmpty } from "../validation.js";

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

const milestonesField = z
  .any()
  .optional()
  .transform((v, ctx) => {
    // v===undefined muss unverändert durchgereicht werden: Zod ruft
    // .transform() bei einem NICHT-partial geparsten Schema (POST) auch
    // für ein komplett fehlendes Feld auf (siehe validation.js) - ohne
    // diesen Fall würde ein einfach nicht mitgeschicktes milestones-Feld
    // fälschlich als "ungültig" abgelehnt statt als "unverändert/leer".
    if (v === undefined) return undefined;
    const clean = sanitizeMilestones(v);
    if (clean === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültige Meilensteine." });
      return z.NEVER;
    }
    return clean;
  });

const goalSchema = z.object({
  title: z
    .string({ required_error: "Titel ist erforderlich.", invalid_type_error: "Titel ist erforderlich." })
    .trim()
    .min(1, "Titel ist erforderlich."),
  description: optionalTextDefaultEmpty,
  target_date: optionalNullableDateString,
  area: z
    .string()
    .refine((v) => isValidArea(v), { message: "Ungültiger Bereich." })
    .optional(),
  status: z.enum(STATUSES, { errorMap: () => ({ message: "Ungültiger Status." }) }).optional(),
  milestones: milestonesField,
  // Wird nur akzeptiert, wenn keine Meilensteine vorhanden sind (siehe
  // computeProgress oben) - daher hier bewusst ungeprüft durchgereicht,
  // genau wie im ursprünglichen Code; computeProgress fängt einen
  // nicht-numerischen Wert selbst über Number()/isNaN ab.
  progress: z.any().optional(),
});

function validateGoalInput(body, options) {
  return validateWithSchema(goalSchema, body, options);
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
  const progress = computeProgress(milestones, data.progress ?? 0);

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
  const manualProgress = data.progress ?? existing.progress;
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
