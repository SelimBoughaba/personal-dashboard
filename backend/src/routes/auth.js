import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const authRouter = Router();

// Schutz gegen Brute-Force: Jeder im selben WLAN kann die Login-Route
// erreichen, nicht nur der Nutzer selbst. 10 Versuche pro 15 Minuten pro
// IP reichen für normale Tippfehler, bremsen automatisiertes Durchprobieren
// aber wirksam aus.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anmeldeversuche. Bitte in ein paar Minuten erneut versuchen." },
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body || {};
  const hash = process.env.APP_PASSWORD_HASH;

  if (!hash) {
    return res.status(500).json({
      error: "Server ist nicht konfiguriert (APP_PASSWORD_HASH fehlt in .env).",
    });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Passwort fehlt." });
  }

  try {
    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      return res.status(401).json({ error: "Falsches Passwort." });
    }

    const token = jwt.sign({ sub: "owner" }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    res.json({ token });
  } catch (err) {
    console.error("Login-Fehler:", err);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
});
