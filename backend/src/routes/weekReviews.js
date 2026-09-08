import { Router } from "express";
import { db } from "../db.js";
import { addDays, startOfWeek } from "../recurrence.js";
import { getEvents } from "../caldav.js";

export const weekReviewsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseSummary(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Berechnet den Wochenrückblick live aus den tatsächlichen Daten - "Belege
// statt motivationaler KI-Erzählung" (Punkt 68): reine Zählungen und
// Kurztitel aus den echten Tabellen, kein generierter Text.
async function computeWeek(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const nextWeekStart = addDays(weekEnd, 1);
  const nextWeekEnd = addDays(weekEnd, 7);

  const completed = db
    .prepare(`SELECT id, title FROM tasks WHERE deleted_at IS NULL AND status = 'erledigt' AND date(updated_at) BETWEEN ? AND ? ORDER BY updated_at`)
    .all(weekStart, weekEnd);

  const leftover = db
    .prepare(`SELECT id, title, due_date FROM tasks WHERE deleted_at IS NULL AND status = 'offen' AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date`)
    .all(weekEnd);

  const upcomingTasks = db
    .prepare(`SELECT id, title, due_date FROM tasks WHERE deleted_at IS NULL AND status = 'offen' AND due_date BETWEEN ? AND ?`)
    .all(nextWeekStart, nextWeekEnd);
  const upcomingInvoices = db
    .prepare(`SELECT id, subject, sender_name, due_date FROM invoices WHERE deleted_at IS NULL AND status = 'offen' AND due_date BETWEEN ? AND ?`)
    .all(nextWeekStart, nextWeekEnd);
  const upcomingContracts = db
    .prepare(`SELECT id, title, next_renewal_date FROM contracts WHERE deleted_at IS NULL AND next_renewal_date BETWEEN ? AND ?`)
    .all(nextWeekStart, nextWeekEnd);

  const upcomingDeadlines = [
    ...upcomingTasks.map((t) => ({ type: "aufgabe", id: t.id, title: t.title, date: t.due_date })),
    ...upcomingInvoices.map((i) => ({ type: "rechnung", id: i.id, title: i.sender_name ? `${i.sender_name} – ${i.subject}` : i.subject, date: i.due_date })),
    ...upcomingContracts.map((c) => ({ type: "vertrag", id: c.id, title: c.title, date: c.next_renewal_date })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let events = { count: null, error: null };
  try {
    const dayStart = new Date(`${weekStart}T00:00:00`);
    const dayEnd = new Date(`${weekEnd}T23:59:59`);
    const rows = await getEvents({ from: dayStart.toISOString(), to: dayEnd.toISOString() });
    events = { count: rows.length, error: null };
  } catch (err) {
    events = { count: null, error: err.code === "NOT_CONFIGURED" ? null : "Kalender konnte nicht geladen werden." };
  }

  return { weekStart, weekEnd, completed, leftover, upcomingDeadlines, events };
}

// GET /api/week-reviews - abgeschlossene Rückblicke (Verlauf), neueste zuerst.
weekReviewsRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT week_start, closed_at, summary FROM week_reviews ORDER BY week_start DESC").all();
  res.json(rows.map((r) => ({ weekStart: r.week_start, closedAt: r.closed_at, ...parseSummary(r.summary) })));
});

// GET /api/week-reviews/:weekStart - live berechnet, oder der gespeicherte
// (datensparsame) Snapshot, falls diese Woche bereits abgeschlossen wurde.
weekReviewsRouter.get("/:weekStart", async (req, res) => {
  if (!DATE_RE.test(req.params.weekStart)) return res.status(400).json({ error: "Ungültiges Datum." });
  const weekStart = startOfWeek(req.params.weekStart);

  const existing = db.prepare("SELECT week_start, closed_at, summary FROM week_reviews WHERE week_start = ?").get(weekStart);
  if (existing) {
    return res.json({ weekStart, closed: true, closedAt: existing.closed_at, ...parseSummary(existing.summary) });
  }

  const data = await computeWeek(weekStart);
  res.json({ ...data, closed: false, closedAt: null });
});

// POST /api/week-reviews/:weekStart/close - speichert einen datensparsamen
// Snapshot (Zahlen + Kurztitel, keine vollständigen Objekte). Bereits
// abgeschlossene Wochen bleiben unverändert (nachvollziehbar, siehe
// Migration 0018) statt bei erneutem Aufruf überschrieben zu werden.
weekReviewsRouter.post("/:weekStart/close", async (req, res) => {
  if (!DATE_RE.test(req.params.weekStart)) return res.status(400).json({ error: "Ungültiges Datum." });
  const weekStart = startOfWeek(req.params.weekStart);

  const existing = db.prepare("SELECT week_start, closed_at, summary FROM week_reviews WHERE week_start = ?").get(weekStart);
  if (existing) {
    return res.json({ weekStart, closed: true, closedAt: existing.closed_at, ...parseSummary(existing.summary) });
  }

  const data = await computeWeek(weekStart);
  const summary = {
    weekEnd: data.weekEnd,
    completedCount: data.completed.length,
    completedTitles: data.completed.slice(0, 30).map((t) => t.title),
    leftoverCount: data.leftover.length,
    leftoverTitles: data.leftover.slice(0, 30).map((t) => t.title),
    upcomingDeadlineCount: data.upcomingDeadlines.length,
    eventCount: data.events.count,
  };

  db.prepare("INSERT INTO week_reviews (week_start, summary) VALUES (?, ?)").run(weekStart, JSON.stringify(summary));
  const saved = db.prepare("SELECT closed_at FROM week_reviews WHERE week_start = ?").get(weekStart);
  res.status(201).json({ weekStart, closed: true, closedAt: saved.closed_at, ...summary });
});
