import { Router } from "express";
import { checkCalendarConnection, listActiveNotifications, setNotificationState } from "../notifications.js";

export const notificationsRouter = Router();

// GET /api/notifications - aktuelle Benachrichtigungen (Fristen live
// berechnet, Hintergrund-/Fehlerereignisse gespeichert), erledigte und noch
// verschobene Einträge ausgeblendet. Der Kalender-Verbindungstest läuft
// hier bei jedem Abruf mit, siehe Kommentar in notifications.js.
notificationsRouter.get("/", async (req, res) => {
  await checkCalendarConnection();
  res.json(listActiveNotifications());
});

// PATCH /api/notifications/:key - Gelesen/Erledigt/Verschoben-Zustand
// setzen. :key ist keine numerische ID, sondern der zusammengesetzte
// Schlüssel (z. B. "deadline:aufgabe:12", "error:calendar") - deckt live
// berechnete und gespeicherte Benachrichtigungen einheitlich ab.
notificationsRouter.patch("/:key", (req, res) => {
  const { read, done, snoozedUntil } = req.body || {};
  const patch = {};
  if (typeof read === "boolean") patch.read = read;
  if (typeof done === "boolean") patch.done = done;
  if ("snoozedUntil" in (req.body || {})) {
    if (snoozedUntil !== null && !/^\d{4}-\d{2}-\d{2}$/.test(snoozedUntil || "")) {
      return res.status(400).json({ error: "snoozedUntil muss ein Datum (YYYY-MM-DD) oder null sein." });
    }
    patch.snoozedUntil = snoozedUntil;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Keine gültige Änderung angegeben (read/done/snoozedUntil)." });
  }
  setNotificationState(req.params.key, patch);
  res.json({ ok: true });
});
