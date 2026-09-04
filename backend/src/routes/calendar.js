import { Router } from "express";
import { getEvents } from "../caldav.js";

export const calendarRouter = Router();

calendarRouter.get("/events", async (req, res) => {
  const from = req.query.from || new Date().toISOString();
  const defaultTo = new Date();
  defaultTo.setDate(defaultTo.getDate() + 7);
  const to = req.query.to || defaultTo.toISOString();

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
