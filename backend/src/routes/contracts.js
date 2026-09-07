import { Router } from "express";
import { z } from "zod";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { CONTRACT_STATUSES as STATUSES, CONTRACT_BILLING_CYCLES as CYCLES } from "../constants.js";
import { validateWithSchema, optionalNullableDateString, optionalTextDefaultEmpty } from "../validation.js";

export const contractsRouter = Router();

// "" oder null wird zu null (kein Wert eingetragen); jeder andere Wert muss
// eine endliche Zahl sein - Number.isFinite statt nur !isNaN, weil
// Number("Infinity") kein NaN ist, aber trotzdem kein sinnvoller
// Kostenwert für eine REAL-Spalte.
// v===undefined muss explizit vor v===""/null geprüft werden und
// unverändert (undefined) durchgereicht werden, nicht als null behandelt
// werden: Zod ruft .transform() bei einem NICHT-partial geparsten Schema
// auch für ein komplett fehlendes Feld mit v=undefined auf (siehe
// validation.js) - ohne diese Unterscheidung würde ein bei PATCH gar
// nicht mitgeschicktes Feld fälschlich als "auf null setzen" interpretiert.
const nullableFiniteCost = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    const num = Number(v);
    if (!Number.isFinite(num)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültige Kosten." });
      return z.NEVER;
    }
    return num;
  });

const nullableNonNegativeInteger = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === "" || v === null) return null;
    const num = Number(v);
    if (!Number.isInteger(num) || num < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültige Kündigungsfrist." });
      return z.NEVER;
    }
    return num;
  });

const contractSchema = z.object({
  title: z
    .string({ required_error: "Titel ist erforderlich.", invalid_type_error: "Titel ist erforderlich." })
    .trim()
    .min(1, "Titel ist erforderlich."),
  provider: optionalTextDefaultEmpty,
  notes: optionalTextDefaultEmpty,
  next_renewal_date: optionalNullableDateString,
  area: z
    .string()
    .refine((v) => isValidArea(v), { message: "Ungültiger Bereich." })
    .optional(),
  status: z.enum(STATUSES, { errorMap: () => ({ message: "Ungültiger Status." }) }).optional(),
  billing_cycle: z.enum(CYCLES, { errorMap: () => ({ message: "Ungültiger Abrechnungszyklus." }) }).optional(),
  cost: nullableFiniteCost,
  cancellation_period_days: nullableNonNegativeInteger,
});

function validateContractInput(body, options) {
  return validateWithSchema(contractSchema, body, options);
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
