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
        error: "Mail ist nicht konfiguriert (IONOS_IMAP_* fehlen in .env).",
      });
    }
    console.error("IMAP-Fehler:", err);
    res.status(502).json({
      error: "Mails konnten nicht geladen werden. IMAP-Zugangsdaten/Host prüfen.",
    });
  }
});
