import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  getPasswordHash,
  setSetting,
  setSettingIfAbsent,
  getJwtSecret,
  getTokenVersion,
  bumpTokenVersion,
} from "../configStore.js";
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

// Eigene, ebenso strenge Begrenzung für Passwortänderungen: ohne sie könnte
// jemand mit einem gültigen (z. B. gestohlenen) Token unbegrenzt oft
// "aktuelles Passwort" durchprobieren, um es zu erraten.
const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen." },
});

// bcrypt verarbeitet nur die ersten 72 Bytes eines Passworts – alles danach
// wird von der zugrunde liegenden Implementierung still ignoriert. Zwei
// Passwörter mit demselben 72-Byte-Präfix, aber unterschiedlichem Rest,
// würden sonst unbemerkt zum selben Hash führen. Statt das hinzunehmen,
// lehnen wir zu lange Passwörter mit einer klaren Meldung ab.
const BCRYPT_MAX_BYTES = 72;
function exceedsBcryptByteLimit(password) {
  return Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES;
}

function signToken() {
  return jwt.sign({ sub: "owner", v: getTokenVersion() }, getJwtSecret(), { expiresIn: "30d" });
}

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
  // Günstiger Vorab-Check spart bei einer offensichtlich bereits
  // eingerichteten Installation das (relativ teure) bcrypt-Hashing – die
  // eigentliche Absicherung gegen zwei gleichzeitige Setup-Versuche ist der
  // atomare Claim weiter unten, nicht dieser Check.
  if (getPasswordHash()) {
    return res.status(403).json({ error: "Es ist bereits ein Passwort eingerichtet." });
  }
  const { password } = req.body || {};
  if (!password || typeof password !== "string" || password.length < 4) {
    return res.status(400).json({ error: "Passwort muss mindestens 4 Zeichen haben." });
  }
  if (exceedsBcryptByteLimit(password)) {
    return res.status(400).json({ error: "Passwort ist zu lang (maximal 72 Bytes)." });
  }

  const hash = await bcrypt.hash(password, 12);

  // Atomarer Claim: läuft als einzelnes synchrones SQLite-Statement, daher
  // gewinnt bei zwei gleichzeitigen Requests garantiert genau einer, egal in
  // welcher Reihenfolge ihr jeweiliges (asynchrones) bcrypt.hash() fertig
  // wird. Der Verlierer bekommt denselben 403 wie beim Vorab-Check.
  if (!setSettingIfAbsent("auth.password_hash", hash)) {
    return res.status(403).json({ error: "Es ist bereits ein Passwort eingerichtet." });
  }

  res.status(201).json({ token: signToken() });
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

    res.json({ token: signToken() });
  } catch (err) {
    console.error("Login-Fehler:", err);
    res.status(500).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

authRouter.patch("/password", passwordChangeLimiter, requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
    return res.status(400).json({ error: "Neues Passwort muss mindestens 4 Zeichen haben." });
  }
  if (exceedsBcryptByteLimit(newPassword)) {
    return res.status(400).json({ error: "Neues Passwort ist zu lang (maximal 72 Bytes)." });
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
  // Beendet alle zuvor ausgestellten Tokens (andere Geräte/Browser müssen
  // sich neu anmelden) – siehe configStore.js#bumpTokenVersion. Die
  // aktuelle Sitzung bekommt sofort ein frisches, gültiges Token zurück,
  // damit genau dieser Vorgang niemanden versehentlich selbst aussperrt.
  bumpTokenVersion();
  res.json({ ok: true, token: signToken() });
});
