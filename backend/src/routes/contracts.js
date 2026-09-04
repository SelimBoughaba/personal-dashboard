import { Router } from "express";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { CONTRACT_STATUSES as STATUSES, CONTRACT_BILLING_CYCLES as CYCLES } from "../constants.js";

export const contractsRouter = Router();

function validateContractInput(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (!partial || body.title !== undefined) {
    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      errors.push("Titel ist erforderlich.");
    } else {
      data.title = body.title.trim();
    }
  }
  if (body.provider !== undefined) data.provider = body.provider || "";
  if (body.notes !== undefined) data.notes = body.notes || "";
  if (body.next_renewal_date !== undefined) data.next_renewal_date = body.next_renewal_date || null;
  if (body.area !== undefined) {
    if (!isValidArea(body.area)) errors.push("Ungültiger Bereich.");
    else data.area = body.area;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) errors.push("Ungültiger Status.");
    else data.status = body.status;
  }
  if (body.billing_cycle !== undefined) {
    if (!CYCLES.includes(body.billing_cycle)) errors.push("Ungültiger Abrechnungszyklus.");
    else data.billing_cycle = body.billing_cycle;
  }
  if (body.cost !== undefined) {
    if (body.cost === "" || body.cost === null) data.cost = null;
    else if (Number.isNaN(Number(body.cost))) errors.push("Ungültige Kosten.");
    else data.cost = Number(body.cost);
  }
  if (body.cancellation_period_days !== undefined) {
    if (body.cancellation_period_days === "" || body.cancellation_period_days === null) {
      data.cancellation_period_days = null;
    } else if (Number.isNaN(Number(body.cancellation_period_days))) {
      errors.push("Ungültige Kündigungsfrist.");
    } else {
      data.cancellation_period_days = Number(body.cancellation_period_days);
    }
  }

  return { data, errors };
}

contractsRouter.get("/", (req, res) => {
  const { area, status } = req.query;
  let query = "SELECT * FROM contracts";
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
  query += " ORDER BY next_renewal_date IS NULL, next_renewal_date ASC";

  res.json(db.prepare(query).all(...params));
});

contractsRouter.post("/", (req, res) => {
  const { data, errors } = validateContractInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const stmt = db.prepare(`
    INSERT INTO contracts (title, provider, area, cost, billing_cycle, cancellation_period_days, next_renewal_date, status, notes)
    VALUES (@title, @provider, @area, @cost, @billing_cycle, @cancellation_period_days, @next_renewal_date, @status, @notes)
  `);
  const info = stmt.run({
    title: data.title,
    provider: data.provider ?? "",
    area: data.area ?? getDefaultAreaId(),
    cost: data.cost ?? null,
    billing_cycle: data.billing_cycle ?? "monatlich",
    cancellation_period_days: data.cancellation_period_days ?? null,
    next_renewal_date: data.next_renewal_date ?? null,
    status: data.status ?? "aktiv",
    notes: data.notes ?? "",
  });

  res.status(201).json(db.prepare("SELECT * FROM contracts WHERE id = ?").get(info.lastInsertRowid));
});

contractsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM contracts WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Vertrag nicht gefunden." });

  const { data, errors } = validateContractInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const merged = { ...existing, ...data, id: req.params.id };
  db.prepare(`
    UPDATE contracts SET title=@title, provider=@provider, area=@area, cost=@cost,
      billing_cycle=@billing_cycle, cancellation_period_days=@cancellation_period_days,
      next_renewal_date=@next_renewal_date, status=@status, notes=@notes, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(db.prepare("SELECT * FROM contracts WHERE id = ?").get(req.params.id));
});

contractsRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM contracts WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Vertrag nicht gefunden." });
  res.status(204).send();
});
