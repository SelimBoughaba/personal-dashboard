import { Router } from "express";
import { computeTrustStatus } from "../trustStatus.js";

export const trustStatusRouter = Router();

// GET /api/trust-status - Vertrauens- und Einrichtungsbereich (Punkt 80),
// live berechnet inkl. echter Kalender-Verbindungsprüfung.
trustStatusRouter.get("/", async (req, res) => {
  res.json(await computeTrustStatus());
});
