import { Router } from "express";
import { ImapFlow } from "imapflow";
import { createDAVClient } from "tsdav";
import { getSetting, setSetting, deleteSetting, getAllSettings } from "../configStore.js";
import { resetCalendarCache } from "../caldav.js";
import { withTimeout } from "../mailAccounts.js";

export const settingsRouter = Router();

// Diese Schlüssel enthalten Zugangsdaten/Secrets und werden nie über den
// generischen Bulk-GET ausgeliefert – dafür gibt es die dedizierten,
// passwort-redaktierenden Routen weiter unten.
const SENSITIVE_KEYS = new Set(["auth.password_hash", "auth.jwt_secret", "calendar.icloud", "mail.accounts"]);

settingsRouter.get("/", (req, res) => {
  const all = getAllSettings();
  for (const key of SENSITIVE_KEYS) delete all[key];
  res.json(all);
});

settingsRouter.put("/:key", (req, res) => {
  const { key } = req.params;
  if (SENSITIVE_KEYS.has(key)) {
    return res.status(400).json({ error: "Dieser Schlüssel wird über eine eigene Route verwaltet." });
  }
  setSetting(key, req.body?.value ?? null);
  res.json({ key, value: getSetting(key) });
});

settingsRouter.delete("/:key", (req, res) => {
  if (SENSITIVE_KEYS.has(req.params.key)) {
    return res.status(400).json({ error: "Dieser Schlüssel wird über eine eigene Route verwaltet." });
  }
  deleteSetting(req.params.key);
  res.status(204).send();
});

// ---------- Kalender (iCloud) ----------

settingsRouter.get("/calendar", (req, res) => {
  const config = getSetting("calendar.icloud");
  if (!config) return res.json({ configured: false });
  res.json({ configured: true, username: config.username, areaMap: config.areaMap || {} });
});

settingsRouter.post("/calendar", (req, res) => {
  const { username, appPassword, areaMap } = req.body || {};
  if (!username || !appPassword) {
    return res.status(400).json({ error: "Apple-ID und App-spezifisches Passwort sind erforderlich." });
  }
  setSetting("calendar.icloud", { username, appPassword, areaMap: areaMap || {} });
  resetCalendarCache();
  res.json({ configured: true, username, areaMap: areaMap || {} });
});

settingsRouter.delete("/calendar", (req, res) => {
  deleteSetting("calendar.icloud");
  resetCalendarCache();
  res.status(204).send();
});

settingsRouter.post("/calendar/test", async (req, res) => {
  const { username, appPassword } = req.body || {};
  if (!username || !appPassword) {
    return res.status(400).json({ error: "Apple-ID und App-spezifisches Passwort sind erforderlich." });
  }
  try {
    const client = await withTimeout(
      createDAVClient({
        serverUrl: "https://caldav.icloud.com",
        credentials: { username, password: appPassword },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      }),
      15000,
      "iCloud-Verbindungstest",
    );
    const calendars = await client.fetchCalendars();
    res.json({
      ok: true,
      calendarNames: calendars.map((c) => c.displayName).filter(Boolean),
    });
  } catch (err) {
    console.error("iCloud-CalDAV-Verbindungstest fehlgeschlagen:", err);
    res.status(400).json({ ok: false, error: "Verbindung fehlgeschlagen. Apple-ID/App-Passwort prüfen." });
  }
});

// ---------- Mail-Konten ----------

function redactAccount(account) {
  const { password, ...rest } = account;
  return { ...rest, hasPassword: !!password };
}

settingsRouter.get("/mail/accounts", (req, res) => {
  const accounts = getSetting("mail.accounts", []);
  res.json(accounts.map(redactAccount));
});

settingsRouter.post("/mail/accounts", (req, res) => {
  const { id, label, host, port, user, password } = req.body || {};
  if (!id || !host || !user || !password) {
    return res.status(400).json({ error: "Kennung, Host, Benutzername und Passwort sind erforderlich." });
  }
  const accounts = getSetting("mail.accounts", []);
  if (accounts.some((a) => a.id === id)) {
    return res.status(409).json({ error: "Ein Konto mit dieser Kennung existiert bereits." });
  }
  const account = { id, label: label || id, host, port: Number(port) || 993, user, password, paused: false };
  setSetting("mail.accounts", [...accounts, account]);
  res.status(201).json(redactAccount(account));
});

settingsRouter.patch("/mail/accounts/:id", (req, res) => {
  const accounts = getSetting("mail.accounts", []);
  const idx = accounts.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Konto nicht gefunden." });

  const body = req.body || {};
  const updated = {
    ...accounts[idx],
    ...(body.label !== undefined ? { label: body.label } : {}),
    ...(body.host !== undefined ? { host: body.host } : {}),
    ...(body.port !== undefined ? { port: Number(body.port) || 993 } : {}),
    ...(body.user !== undefined ? { user: body.user } : {}),
    ...(body.password ? { password: body.password } : {}),
    ...(body.paused !== undefined ? { paused: !!body.paused } : {}),
  };
  const next = [...accounts];
  next[idx] = updated;
  setSetting("mail.accounts", next);
  res.json(redactAccount(updated));
});

settingsRouter.delete("/mail/accounts/:id", (req, res) => {
  const accounts = getSetting("mail.accounts", []);
  const next = accounts.filter((a) => a.id !== req.params.id);
  if (next.length === accounts.length) return res.status(404).json({ error: "Konto nicht gefunden." });
  setSetting("mail.accounts", next);
  res.status(204).send();
});

settingsRouter.post("/mail/test", async (req, res) => {
  const { host, port, user, password } = req.body || {};
  if (!host || !user || !password) {
    return res.status(400).json({ error: "Host, Benutzername und Passwort sind erforderlich." });
  }
  const client = new ImapFlow({
    host,
    port: Number(port) || 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });
  try {
    await withTimeout(client.connect(), 15000, "IMAP-Verbindungstest");
    await client.logout().catch(() => client.close());
    res.json({ ok: true });
  } catch (err) {
    console.error("IMAP-Verbindungstest fehlgeschlagen:", err);
    res.status(400).json({ ok: false, error: "Verbindung fehlgeschlagen. Host/Zugangsdaten prüfen." });
  }
});

settingsRouter.put("/mail/area-rules", (req, res) => {
  setSetting("mail.area_rules", req.body?.rules || {});
  res.json({ rules: getSetting("mail.area_rules", {}) });
});
