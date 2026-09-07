import { Router } from "express";
import { getEvents } from "../caldav.js";

export const calendarRouter = Router();

const MAX_RANGE_DAYS = 400; // deckt eine Monatsansicht plus großzügigen Puffer ab

calendarRouter.get("/events", async (req, res) => {
  const from = req.query.from || new Date().toISOString();
  const defaultTo = new Date();
  defaultTo.setDate(defaultTo.getDate() + 7);
  const to = req.query.to || defaultTo.toISOString();

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: "Ungültiger Zeitraum." });
  }
  if (toDate <= fromDate) {
    return res.status(400).json({ error: "„Bis“ muss nach „Von“ liegen." });
  }
  const rangeDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000);
  if (rangeDays > MAX_RANGE_DAYS) {
    return res.status(400).json({ error: `Zeitraum darf höchstens ${MAX_RANGE_DAYS} Tage umfassen.` });
  }

  try {
    const events = await getEvents({ from, to });
    res.json(events);
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") {
      return res.status(503).json({
        error: "Kalender ist nicht konfiguriert. In den Einstellungen unter „Kalender“ einrichten.",
      });
    }
    console.error("CalDAV-Fehler:", err);
    res.status(502).json({
      error: "Kalender konnte nicht geladen werden. iCloud-Zugangsdaten/App-Passwort prüfen.",
    });
  }
});
