import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { GOAL_STATUSES as STATUSES, GOAL_REVIEW_FREQS as REVIEW_FREQS } from "../constants.js";
import { validateWithSchema, optionalNullableDateString, optionalTextDefaultEmpty } from "../validation.js";
import { computeNextOccurrence, todayIso } from "../recurrence.js";

export const goalsRouter = Router();

// Feste Kadenzen statt eines frei wählbaren Intervalls wie bei
// wiederkehrenden Aufgaben (Punkt 78 statt Punkt 66) - ein Ziel braucht
// einen ruhigen Rhythmus zum Innehalten, keine tägliche/wöchentliche
// Wiederholung. Wiederverwendet dieselbe Datumsarithmetik wie Aufgaben
// (recurrence.js), nur mit anderen, gröberen Bausteinen.
const REVIEW_FREQ_TO_RECURRENCE = {
  monthly: { freq: "monthly", interval: 1 },
  quarterly: { freq: "monthly", interval: 3 },
  yearly: { freq: "monthly", interval: 12 },
};

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
  review_freq: z.enum(REVIEW_FREQS, { errorMap: () => ({ message: "Ungültiger Überprüfungsturnus." }) }).nullable().optional(),
  next_review_date: optionalNullableDateString,
});

function validateGoalInput(body, options) {
  return validateWithSchema(goalSchema, body, options);
}

goalsRouter.get("/", (req, res) => {
  const { area, status } = req.query;
  let query = "SELECT * FROM goals";
  const clauses = ["deleted_at IS NULL"];
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
  const reviewFreq = data.review_freq ?? null;
  // Ein neu festgelegter Turnus zählt ab heute, sofern kein explizites
  // Startdatum mitgeschickt wurde - ohne das müsste die Nutzerin selbst
  // ausrechnen, wann "in einem Monat" ist.
  const nextReviewDate =
    data.next_review_date !== undefined
      ? data.next_review_date
      : reviewFreq
        ? computeNextOccurrence(todayIso(), REVIEW_FREQ_TO_RECURRENCE[reviewFreq])
        : null;

  const stmt = db.prepare(`
    INSERT INTO goals (title, description, area, target_date, status, progress, milestones, review_freq, next_review_date)
    VALUES (@title, @description, @area, @target_date, @status, @progress, @milestones, @review_freq, @next_review_date)
  `);
  const info = stmt.run({
    title: data.title,
    description: data.description ?? "",
    area: data.area ?? getDefaultAreaId(),
    target_date: data.target_date ?? null,
    status: data.status ?? "aktiv",
    progress,
    milestones: JSON.stringify(milestones),
    review_freq: reviewFreq,
    next_review_date: nextReviewDate,
  });

  res.status(201).json(serialize(db.prepare("SELECT * FROM goals WHERE id = ?").get(info.lastInsertRowid)));
});

goalsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Ziel nicht gefunden." });

  const { data, errors } = validateGoalInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const milestones = data.milestones ?? parseMilestones(existing.milestones);
  const manualProgress = data.progress ?? existing.progress;
  const progress = computeProgress(milestones, manualProgress);

  const reviewFreq = data.review_freq === undefined ? existing.review_freq : data.review_freq;
  let nextReviewDate;
  if (data.next_review_date !== undefined) {
    nextReviewDate = data.next_review_date;
  } else if (data.review_freq !== undefined && data.review_freq !== existing.review_freq) {
    // Turnus wurde in diesem Request geändert (gesetzt, gewechselt oder
    // entfernt) und kein eigenes Datum mitgeschickt: neu berechnen bzw.
    // löschen, statt ein Datum stehen zu lassen, das zu keinem Turnus
    // mehr passt.
    nextReviewDate = reviewFreq ? computeNextOccurrence(todayIso(), REVIEW_FREQ_TO_RECURRENCE[reviewFreq]) : null;
  } else {
    nextReviewDate = existing.next_review_date;
  }

  const merged = {
    id: req.params.id,
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    area: data.area ?? existing.area,
    target_date: data.target_date === undefined ? existing.target_date : data.target_date,
    status: data.status ?? existing.status,
    progress,
    milestones: JSON.stringify(milestones),
    review_freq: reviewFreq,
    next_review_date: nextReviewDate,
  };

  db.prepare(`
    UPDATE goals SET title=@title, description=@description, area=@area, target_date=@target_date,
      status=@status, progress=@progress, milestones=@milestones, review_freq=@review_freq,
      next_review_date=@next_review_date, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(serialize(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

// Eigener Endpunkt statt eines generischen PATCH-Feldes: das nächste
// Überprüfungsdatum wird server-seitig aus dem Turnus berechnet (dieselbe
// DST-/Monatsende-sichere Arithmetik wie bei wiederkehrenden Aufgaben),
// nicht vom Client vorgerechnet und einfach übernommen.
goalsRouter.post("/:id/mark-reviewed", (req, res) => {
  const existing = db.prepare("SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Ziel nicht gefunden." });
  if (!existing.review_freq) return res.status(400).json({ error: "Kein Überprüfungsturnus festgelegt." });

  const base = existing.next_review_date && existing.next_review_date >= todayIso() ? existing.next_review_date : todayIso();
  const nextReviewDate = computeNextOccurrence(base, REVIEW_FREQ_TO_RECURRENCE[existing.review_freq]);

  db.prepare("UPDATE goals SET next_review_date = ?, updated_at = datetime('now') WHERE id = ?").run(
    nextReviewDate,
    req.params.id,
  );
  res.json(serialize(db.prepare("SELECT * FROM goals WHERE id = ?").get(req.params.id)));
});

goalsRouter.delete("/:id", (req, res) => {
  // Papierkorb (Punkt 77): Soft-Delete statt echtem DELETE, siehe trash.js.
  const info = db.prepare("UPDATE goals SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Ziel nicht gefunden." });
  res.status(204).send();
});
