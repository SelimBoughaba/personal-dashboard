import { Router } from "express";
import { db } from "../db.js";
import { HEALTH_ENTRY_TYPES as TYPES } from "../constants.js";

export const healthRouter = Router();

function validateInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.entry_date !== undefined) {
    if (!body.entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.entry_date)) {
      errors.push("Gültiges Datum ist erforderlich.");
    } else {
      data.entry_date = body.entry_date;
    }
  }
  if (!partial || body.type !== undefined) {
    if (!TYPES.includes(body.type)) errors.push("Ungültiger Eintragstyp.");
    else data.type = body.type;
  }
  if (body.value !== undefined) {
    if (body.value === "" || body.value === null) data.value = null;
    else if (Number.isNaN(Number(body.value))) errors.push("Ungültiger Wert.");
    else data.value = Number(body.value);
  }
  if (body.unit !== undefined) data.unit = body.unit || "";
  if (body.note !== undefined) data.note = body.note || "";

  return { data, errors };
}

healthRouter.get("/", (req, res) => {
  const { type, from, to } = req.query;
  let query = "SELECT * FROM health_entries";
  const clauses = [];
  const params = [];

  if (type && type !== "alle") {
    clauses.push("type = ?");
    params.push(type);
  }
  if (from) {
    clauses.push("entry_date >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("entry_date <= ?");
    params.push(to);
  }
  if (clauses.length) query += " WHERE " + clauses.join(" AND ");
  query += " ORDER BY entry_date DESC, id DESC";

  res.json(db.prepare(query).all(...params));
});

healthRouter.post("/", (req, res) => {
  const { data, errors } = validateInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const stmt = db.prepare(`
    INSERT INTO health_entries (entry_date, type, value, unit, note)
    VALUES (@entry_date, @type, @value, @unit, @note)
  `);
  const info = stmt.run({
    entry_date: data.entry_date,
    type: data.type,
    value: data.value ?? null,
    unit: data.unit ?? "",
    note: data.note ?? "",
  });

  res.status(201).json(db.prepare("SELECT * FROM health_entries WHERE id = ?").get(info.lastInsertRowid));
});

healthRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM health_entries WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Eintrag nicht gefunden." });

  const { data, errors } = validateInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const merged = { ...existing, ...data, id: req.params.id };
  db.prepare(`
    UPDATE health_entries SET entry_date=@entry_date, type=@type, value=@value, unit=@unit, note=@note, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(db.prepare("SELECT * FROM health_entries WHERE id = ?").get(req.params.id));
});

healthRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM health_entries WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Eintrag nicht gefunden." });
  res.status(204).send();
});
