import { Router } from "express";
import { computeFinanceOutlook } from "../financeOutlook.js";

export const financeOutlookRouter = Router();

// GET /api/finance-outlook - 30-/90-Tage-Vorschau (Punkt 71), live berechnet.
financeOutlookRouter.get("/", (req, res) => {
  res.json(computeFinanceOutlook());
});
