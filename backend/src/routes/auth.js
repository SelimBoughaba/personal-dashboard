import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getPasswordHash, setSetting, getJwtSecret } from "../configStore.js";
import { requireAuth } from "../middleware/auth.js";

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

// Öffentlich (kein Login nötig): sagt dem Frontend, ob überhaupt schon ein
// Passwort existiert. Ohne Passwort zeigt die App den Ersteinrichtungs-
// Bildschirm statt des normalen Logins.
authRouter.get("/status", (req, res) => {
  res.json({ configured: !!getPasswordHash() });
});

// Nur nutzbar, solange noch KEIN Passwort existiert (Ersteinrichtung).
// Danach immer 403 – ein Zurücksetzen ohne aktuelles Passwort ist über
// diese Route bewusst nie möglich.
authRouter.post("/setup", loginLimiter, async (req, res) => {
  if (getPasswordHash()) {
    return res.status(403).json({ error: "Es ist bereits ein Passwort eingerichtet." });
  }
  const { password } = req.body || {};
  if (!password || typeof password !== "string" || password.length < 4) {
    return res.status(400).json({ error: "Passwort muss mindestens 4 Zeichen haben." });
  }
  const hash = await bcrypt.hash(password, 12);
  setSetting("auth.password_hash", hash);
  const token = jwt.sign({ sub: "owner" }, getJwtSecret(), { expiresIn: "30d" });
  res.status(201).json({ token });
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { password } = req.body || {};
  const hash = getPasswordHash();

  if (!hash) {
    return res.status(409).json({ error: "Es ist noch kein Passwort eingerichtet." });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Passwort fehlt." });
  }

  try {
    const valid = await bcrypt.compare(password, hash);
    if (!valid) {
      return res.status(401).json({ error: "Falsches Passwort." });
    }

    const token = jwt.sign({ sub: "owner" }, getJwtSecret(), { expiresIn: "30d" });
    res.json({ token });
  } catch (err) {
    console.error("Login-Fehler:", err);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

authRouter.patch("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
    return res.status(400).json({ error: "Neues Passwort muss mindestens 4 Zeichen haben." });
  }

  const hash = getPasswordHash();
  if (hash) {
    const valid = await bcrypt.compare(currentPassword || "", hash);
    if (!valid) {
      return res.status(401).json({ error: "Aktuelles Passwort ist falsch." });
    }
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  setSetting("auth.password_hash", newHash);
  res.json({ ok: true });
});
