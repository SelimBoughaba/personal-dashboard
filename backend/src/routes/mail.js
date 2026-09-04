import { Router } from "express";
import { getMessages } from "../imap.js";

export const mailRouter = Router();

mailRouter.get("/messages", async (req, res) => {
  try {
    const messages = await getMessages();
    res.json(messages);
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") {
      return res.status(503).json({
        error: "E-Mail ist nicht konfiguriert. In den Einstellungen unter „E-Mail“ ein Konto hinzufügen.",
      });
    }
    console.error("IMAP-Fehler:", err);
    res.status(502).json({
      error: "Mails konnten nicht geladen werden. IMAP-Zugangsdaten/Host prüfen.",
    });
  }
});
