import { Router } from "express";
import { TRASH_RETENTION_DAYS } from "../constants.js";
import { listTrash, restoreFromTrash, purgeOne } from "../trash.js";

export const trashRouter = Router();

trashRouter.get("/", (req, res) => {
  res.json({ retentionDays: TRASH_RETENTION_DAYS, items: listTrash() });
});

trashRouter.post("/:type/:id/restore", (req, res) => {
  const result = restoreFromTrash(req.params.type, req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

trashRouter.delete("/:type/:id", (req, res) => {
  const result = purgeOne(req.params.type, req.params.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(204).send();
});
