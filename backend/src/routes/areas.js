import { Router } from "express";
import { db } from "../db.js";

export const areasRouter = Router();

const ID_PATTERN = /^[a-z][a-z0-9_-]{1,29}$/;

areasRouter.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM areas ORDER BY sort_order ASC").all());
});

areasRouter.post("/", (req, res) => {
  const { id, label, color } = req.body || {};
  if (!id || !ID_PATTERN.test(id)) {
    return res.status(400).json({
      error: "Ungültige Kennung (nur Kleinbuchstaben, Ziffern, - und _, muss mit Buchstabe beginnen, 2-30 Zeichen).",
    });
  }
  if (!label || !label.trim()) {
    return res.status(400).json({ error: "Bezeichnung ist erforderlich." });
  }
  const exists = db.prepare("SELECT id FROM areas WHERE id = ?").get(id);
  if (exists) {
    return res.status(409).json({ error: "Ein Bereich mit dieser Kennung existiert bereits." });
  }

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM areas").get().m;
  db.prepare("INSERT INTO areas (id, label, color, sort_order) VALUES (?, ?, ?, ?)").run(
    id,
    label.trim(),
    color || "#94a08f",
    maxOrder + 1,
  );
  res.status(201).json(db.prepare("SELECT * FROM areas WHERE id = ?").get(id));
});

areasRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM areas WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Bereich nicht gefunden." });

  const body = req.body || {};
  if (body.label !== undefined && !body.label.trim()) {
    return res.status(400).json({ error: "Bezeichnung darf nicht leer sein." });
  }

  const run = db.transaction(() => {
    if (body.is_default) {
      db.prepare("UPDATE areas SET is_default = 0").run();
    }
    db.prepare(
      `UPDATE areas SET
        label = @label,
        color = @color,
        archived = @archived,
        is_default = @is_default,
        updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id: req.params.id,
      label: body.label !== undefined ? body.label.trim() : existing.label,
      color: body.color ?? existing.color,
      archived: body.archived !== undefined ? (body.archived ? 1 : 0) : existing.archived,
      is_default: body.is_default !== undefined ? (body.is_default ? 1 : 0) : existing.is_default,
    });
  });
  run();

  res.json(db.prepare("SELECT * FROM areas WHERE id = ?").get(req.params.id));
});

// Reihenfolge setzen: { order: ["id1", "id2", ...] }
areasRouter.post("/reorder", (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ error: "order muss eine nicht-leere Liste von Bereichs-IDs sein." });
  }
  const run = db.transaction(() => {
    order.forEach((id, index) => {
      db.prepare("UPDATE areas SET sort_order = ? WHERE id = ?").run(index, id);
    });
  });
  run();
  res.json(db.prepare("SELECT * FROM areas ORDER BY sort_order ASC").all());
});

// Löschen erfordert entweder, dass der Bereich leer ist, oder eine
// Zielzuordnung (reassign_to) für vorhandene Aufgaben/Rechnungen.
areasRouter.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM areas WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Bereich nicht gefunden." });

  const totalAreas = db.prepare("SELECT COUNT(*) AS c FROM areas").get().c;
  if (totalAreas <= 1) {
    return res.status(400).json({ error: "Der letzte verbleibende Bereich kann nicht gelöscht werden." });
  }

  const { reassign_to } = req.body || {};
  const taskCount = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE area = ?").get(req.params.id).c;
  const invoiceCount = db.prepare("SELECT COUNT(*) AS c FROM invoices WHERE area = ?").get(req.params.id).c;

  if ((taskCount > 0 || invoiceCount > 0) && !reassign_to) {
    return res.status(409).json({
      error: "Diesem Bereich sind noch Einträge zugeordnet. Bitte Zielbereich für die Neuzuordnung angeben.",
      needsReassignment: true,
      taskCount,
      invoiceCount,
    });
  }
  if (reassign_to) {
    const target = db.prepare("SELECT id FROM areas WHERE id = ?").get(reassign_to);
    if (!target) return res.status(400).json({ error: "Ziel-Bereich existiert nicht." });
    if (reassign_to === req.params.id) {
      return res.status(400).json({ error: "Zielbereich darf nicht der gelöschte Bereich selbst sein." });
    }
  }

  const run = db.transaction(() => {
    if (reassign_to) {
      db.prepare("UPDATE tasks SET area = ? WHERE area = ?").run(reassign_to, req.params.id);
      db.prepare("UPDATE invoices SET area = ? WHERE area = ?").run(reassign_to, req.params.id);
    }
    db.prepare("DELETE FROM areas WHERE id = ?").run(req.params.id);
    if (existing.is_default) {
      const next = db.prepare("SELECT id FROM areas ORDER BY sort_order ASC LIMIT 1").get();
      if (next) db.prepare("UPDATE areas SET is_default = 1 WHERE id = ?").run(next.id);
    }
  });
  run();

  res.status(204).send();
});
