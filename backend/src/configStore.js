// Auflösung von Konfiguration: liegt ein Wert in der settings-Tabelle vor,
// gewinnt er. Sonst dient die .env als Erstlauf-Fallback (deckt bestehende
// lokale Installationen ab, die noch nicht über die Oberfläche
// eingerichtet wurden). Alles landet in derselben lokalen SQLite-Datenbank
// auf dem Mac – nichts verlässt das Gerät.

import crypto from "node:crypto";
import { db } from "./db.js";

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, JSON.stringify(value));
}

export function deleteSetting(key) {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function getAllSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

function parseJsonEnv(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export function getIcloudConfig() {
  const stored = getSetting("calendar.icloud");
  if (stored) return stored;
  if (process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD) {
    return {
      username: process.env.ICLOUD_USERNAME,
      appPassword: process.env.ICLOUD_APP_PASSWORD,
      areaMap: parseJsonEnv(process.env.CALENDAR_AREA_MAP),
    };
  }
  return null;
}

export function getMailAccounts() {
  const stored = getSetting("mail.accounts");
  if (stored && stored.length) return stored;
  if (process.env.IONOS_IMAP_HOST && process.env.IONOS_IMAP_USER && process.env.IONOS_IMAP_PASSWORD) {
    return [
      {
        id: "ionos",
        label: "IONOS",
        host: process.env.IONOS_IMAP_HOST,
        port: Number(process.env.IONOS_IMAP_PORT) || 993,
        user: process.env.IONOS_IMAP_USER,
        password: process.env.IONOS_IMAP_PASSWORD,
        paused: false,
      },
    ];
  }
  return [];
}

export function getMailAreaRules() {
  const stored = getSetting("mail.area_rules");
  if (stored) return stored;
  return parseJsonEnv(process.env.MAIL_AREA_RULES);
}

export function getPasswordHash() {
  return getSetting("auth.password_hash") || process.env.APP_PASSWORD_HASH || null;
}

const INSECURE_JWT_SECRETS = new Set(["change-me-to-a-long-random-string"]);
const MIN_JWT_SECRET_LENGTH = 32;

// JWT-Secret: aus der Datenbank, sonst aus .env (falls sinnvoll gesetzt),
// sonst wird beim allerersten Start automatisch ein sicherer Zufallswert
// erzeugt und dauerhaft gespeichert. So muss niemand technisches Wissen
// mitbringen ("openssl rand ..."), um die App zu starten.
export function getJwtSecret() {
  const stored = getSetting("auth.jwt_secret");
  if (stored) return stored;

  const envSecret = process.env.JWT_SECRET || "";
  if (envSecret && !INSECURE_JWT_SECRETS.has(envSecret) && envSecret.length >= MIN_JWT_SECRET_LENGTH) {
    setSetting("auth.jwt_secret", envSecret);
    return envSecret;
  }

  const generated = crypto.randomBytes(32).toString("hex");
  setSetting("auth.jwt_secret", generated);
  return generated;
}
