import { Router } from "express";
import { z } from "zod";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { TASK_PRIORITIES as PRIORITIES, TASK_STATUSES as STATUSES } from "../constants.js";
import { validateWithSchema, optionalNullableDateString, optionalTextDefaultEmpty } from "../validation.js";
import { planNextOccurrence, todayIso } from "../recurrence.js";

export const tasksRouter = Router();

const RECURRENCE_FREQS = ["daily", "weekly", "monthly"];
const RECURRENCE_MODES = ["fest", "nach_abschluss"];

// null = Wiederholung ausdrücklich entfernen, undefined = Feld nicht
// mitgeschickt (unverändert lassen) - dieselbe Unterscheidung wie bei
// milestonesField in goals.js, hier nur mit mehreren granularen
// Fehlermeldungen statt einer pauschalen.
const recurrenceField = z
  .any()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== "object" || Array.isArray(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültige Wiederholungsregel." });
      return z.NEVER;
    }
    if (!RECURRENCE_FREQS.includes(v.freq)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültige Wiederholungsfrequenz." });
      return z.NEVER;
    }
    if (!RECURRENCE_MODES.includes(v.mode)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültiger Wiederholungsmodus." });
      return z.NEVER;
    }
    const interval = Number(v.interval);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültiges Wiederholungsintervall." });
      return z.NEVER;
    }
    if (v.until !== undefined && v.until !== null && typeof v.until !== "string") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültiges Enddatum der Wiederholung." });
      return z.NEVER;
    }
    return { freq: v.freq, mode: v.mode, interval, weekdaysOnly: !!v.weekdaysOnly, until: v.until || null };
  });

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
  recurrence: recurrenceField,
});

function validateTaskInput(body, options) {
  return validateWithSchema(taskSchema, body, options);
}

function parseRecurrence(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function serialize(row) {
  return { ...row, recurrence: parseRecurrence(row.recurrence) };
}

// Erzeugt bei Bedarf die nächste Instanz einer wiederkehrenden Aufgabe -
// beim Abschließen (Punkt 66: Serie geht weiter) genauso wie beim Löschen
// einer offenen Instanz (verstanden als "dieses eine Vorkommen
// überspringen", nicht als Serienende - sonst würde jedes Löschen
// versehentlich die ganze Serie beenden). `sourceRow` bleibt dabei selbst
// unverändert; die Folgeinstanz ist eine eigene, unabhängige tasks-Zeile
// mit derselben Wiederholungsregel.
function spawnNextOccurrence(sourceRow) {
  const recurrence = parseRecurrence(sourceRow.recurrence);
  if (!recurrence) return null;

  const plan = planNextOccurrence({ recurrence, dueDate: sourceRow.due_date, todayIso: todayIso() });
  if (!plan) return null; // Serie beendet (Enddatum überschritten)

  // Rückstand sichtbar machen statt ihn stillschweigend verschwinden zu
  // lassen (Punkt 66: "keine unkontrollierte Erzeugung ... Rückstände" -
  // heißt nicht "der Rückstand darf unsichtbar sein", nur dass nicht eine
  // Zeile pro übersprungenem Vorkommen entsteht).
  const notes =
    plan.skippedCount > 0
      ? `${sourceRow.notes ? sourceRow.notes + "\n\n" : ""}(${plan.skippedCount} automatisch übersprungene${
          plan.skippedCount === 1 ? "s Vorkommen" : " Vorkommen"
        }, da überfällig.)`
      : sourceRow.notes;

  const stmt = db.prepare(`
    INSERT INTO tasks (title, notes, due_date, priority, area, status, recurrence)
    VALUES (@title, @notes, @due_date, @priority, @area, 'offen', @recurrence)
  `);
  const info = stmt.run({
    title: sourceRow.title,
    notes: notes ?? "",
    due_date: plan.dueDate,
    priority: sourceRow.priority,
    area: sourceRow.area,
    recurrence: sourceRow.recurrence,
  });
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
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
  res.json(rows.map(serialize));
});

tasksRouter.post("/", (req, res) => {
  const { data, errors } = validateTaskInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const stmt = db.prepare(`
    INSERT INTO tasks (title, notes, due_date, priority, area, status, recurrence)
    VALUES (@title, @notes, @due_date, @priority, @area, @status, @recurrence)
  `);
  const info = stmt.run({
    title: data.title,
    notes: data.notes ?? "",
    due_date: data.due_date ?? null,
    priority: data.priority ?? "mittel",
    area: data.area ?? getDefaultAreaId(),
    status: "offen",
    recurrence: data.recurrence ? JSON.stringify(data.recurrence) : null,
  });

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(serialize(task));
});

tasksRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Aufgabe nicht gefunden." });

  const { data, errors } = validateTaskInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const recurrenceForStorage =
    data.recurrence === undefined ? existing.recurrence : data.recurrence ? JSON.stringify(data.recurrence) : null;

  const merged = { ...existing, ...data, recurrence: recurrenceForStorage };
  db.prepare(`
    UPDATE tasks SET title=@title, notes=@notes, due_date=@due_date,
      priority=@priority, area=@area, status=@status, recurrence=@recurrence, updated_at=datetime('now')
    WHERE id=@id
  `).run({ ...merged, id: req.params.id });

  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);

  let followUp = null;
  if (existing.status !== "erledigt" && task.status === "erledigt") {
    followUp = spawnNextOccurrence(task);
  }

  res.json({ ...serialize(task), followUp: followUp ? serialize(followUp) : null });
});

tasksRouter.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Aufgabe nicht gefunden." });

  if (existing.status !== "erledigt") spawnNextOccurrence(existing);

  db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
  res.status(204).send();
});
