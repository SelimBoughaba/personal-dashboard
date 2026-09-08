import { Router } from "express";
import { z } from "zod";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { VORGANG_STATUSES as STATUSES } from "../constants.js";
import { validateWithSchema, optionalTextDefaultEmpty } from "../validation.js";

export const vorgaengeRouter = Router();

// Vorgang (Punkt 69, voller Umfang): "Aufgaben, Notizen, Dokumente,
// Rechnungen, Verträge und Ziele in einem benannten Vorgang bündeln."
// Bewusste Design-Entscheidung: ein Vorgang ist selbst nur ein weiterer
// verlinkbarer Objekttyp (siehe constants.js LINK_OBJECT_TABLES) - das
// "Bündeln" sind ganz normale object_links-Zeilen zwischen dem Vorgang und
// den gebündelten Objekten, dieselbe Route (routes/links.js) wie bei jeder
// anderen Verknüpfung. Diese Route hier verwaltet nur den Vorgang selbst
// (Titel/Beschreibung/Bereich/Status) - keine eigene Beziehungslogik, kein
// Rollen-/Sprint-/Pflichtprozess-Modell.
const vorgangSchema = z.object({
  title: z
    .string({ required_error: "Titel ist erforderlich.", invalid_type_error: "Titel ist erforderlich." })
    .trim()
    .min(1, "Titel ist erforderlich."),
  description: optionalTextDefaultEmpty,
  area: z
    .string()
    .refine((v) => isValidArea(v), { message: "Ungültiger Bereich." })
    .optional(),
  status: z.enum(STATUSES, { errorMap: () => ({ message: "Ungültiger Status." }) }).optional(),
});

function validateInput(body, options) {
  return validateWithSchema(vorgangSchema, body, options);
}

vorgaengeRouter.get("/", (req, res) => {
  const { area, status } = req.query;
  let query = "SELECT * FROM vorgaenge WHERE deleted_at IS NULL";
  const params = [];

  if (area && area !== "alle") {
    query += " AND area = ?";
    params.push(area);
  }
  if (status && status !== "alle") {
    query += " AND status = ?";
    params.push(status);
  }
  query += " ORDER BY status ASC, updated_at DESC";

  res.json(db.prepare(query).all(...params));
});

vorgaengeRouter.post("/", (req, res) => {
  const { data, errors } = validateInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const stmt = db.prepare(`
    INSERT INTO vorgaenge (title, description, area, status)
    VALUES (@title, @description, @area, @status)
  `);
  const info = stmt.run({
    title: data.title,
    description: data.description ?? "",
    area: data.area ?? getDefaultAreaId(),
    status: data.status ?? "aktiv",
  });

  res.status(201).json(db.prepare("SELECT * FROM vorgaenge WHERE id = ?").get(info.lastInsertRowid));
});

vorgaengeRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM vorgaenge WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Vorgang nicht gefunden." });

  const { data, errors } = validateInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const merged = { ...existing, ...data, id: req.params.id };
  db.prepare(`
    UPDATE vorgaenge SET title=@title, description=@description, area=@area, status=@status, updated_at=datetime('now')
    WHERE id=@id
  `).run(merged);

  res.json(db.prepare("SELECT * FROM vorgaenge WHERE id = ?").get(req.params.id));
});

vorgaengeRouter.delete("/:id", (req, res) => {
  // Papierkorb (Punkt 77): Soft-Delete statt echtem DELETE, siehe trash.js.
  // Die object_links-Zeilen zu gebündelten Objekten bleiben bestehen (wie
  // bei jedem anderen getrashten/gelöschten Objekt auch, siehe links.js) -
  // sie lösen sich beim Anzeigen von selbst auf, solange der Vorgang nicht
  // wiederhergestellt wird.
  const info = db
    .prepare("UPDATE vorgaenge SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Vorgang nicht gefunden." });
  res.status(204).send();
});
