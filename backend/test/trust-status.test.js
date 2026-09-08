// Deckt den Vertrauens- und Einrichtungsbereich ab (Punkt 80, siehe
// backend/src/trustStatus.js): Speicherort, verifizierte Sicherung,
// Integrationszustand, Datenfrische und ausstehende lokale Jobs - jede
// Angabe muss eine echte Grundlage haben, kein unbelegtes "grünes Häkchen".
//
// Bewusst KEINE echten iCloud-Zugangsdaten in diesem Test: die Kalender-
// Prüfung in trustStatus.js macht einen ECHTEN Verbindungsversuch (das ist
// hier gerade der Punkt) - mit echten/erfundenen Zugangsdaten wäre dieser
// Test netzwerkabhängig und langsam/instabil. Der "nicht konfiguriert"-Pfad
// (kein Netzwerkzugriff nötig) deckt den Regelfall einer frischen
// Installation ab; der Live-Check selbst ist durch den bereits vorhandenen
// checkCalendarConnection()-Code (siehe notifications.js) abgedeckt.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-trust-status-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;

const { app } = await import("../src/index.js");

let server;
let baseUrl;
let token;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const setup = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password-123" }),
  }).then((r) => r.json());
  token = setup.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(reqPath, options = {}) {
  const res = await fetch(`${baseUrl}${reqPath}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

test("GET /api/trust-status: Speicherort zeigt die tatsächlich verwendeten Pfade", async () => {
  const res = await api("/api/trust-status");
  assert.equal(res.status, 200);
  assert.ok(res.body.storage.dataDir.includes(path.basename(tmpDir)));
  assert.ok(typeof res.body.storage.documentsDir === "string" && res.body.storage.documentsDir.length > 0);
  assert.equal(typeof res.body.storage.databaseSizeBytes, "number");
});

test("GET /api/trust-status: ohne konfigurierten Kalender/Mail kein unbelegtes 'verbunden'", async () => {
  const res = await api("/api/trust-status");
  assert.equal(res.body.integrations.calendar.configured, false);
  assert.equal(res.body.integrations.calendar.ok, null);
  assert.equal(res.body.integrations.mail.configured, false);
  assert.deepEqual(res.body.integrations.mail.accounts, []);
});

test("GET /api/trust-status: konfiguriertes Postfach erscheint einzeln (Punkt 87: Fehlerzustand pro Konto getrennt)", async () => {
  const created = await api("/api/settings/mail/accounts", {
    method: "POST",
    body: JSON.stringify({ id: "test-account", label: "Test", host: "imap.example.invalid", port: 993, user: "test@example.invalid", password: "xxxx" }),
  });
  assert.equal(created.status, 201);

  const res = await api("/api/trust-status");
  assert.equal(res.body.integrations.mail.configured, true);
  assert.equal(res.body.integrations.mail.accounts.length, 1);
  assert.equal(res.body.integrations.mail.accounts[0].id, "test-account");
  assert.equal(res.body.integrations.mail.accounts[0].label, "Test");
  assert.equal(res.body.integrations.mail.accounts[0].active, true);
  assert.equal(res.body.integrations.mail.accounts[0].lastError, null);
});

test("GET /api/trust-status: ein zweites Konto mit eigenem Fehler zeigt das erste Konto nicht fälschlich als betroffen (Punkt 87)", async () => {
  await api("/api/settings/mail/accounts", {
    method: "POST",
    body: JSON.stringify({ id: "gesundes-konto", label: "Gesund", host: "imap.example.invalid", port: 993, user: "a@example.invalid", password: "xxxx" }),
  });
  await api("/api/settings/mail/accounts", {
    method: "POST",
    body: JSON.stringify({ id: "gestoertes-konto", label: "Gestört", host: "imap.example.invalid", port: 993, user: "b@example.invalid", password: "xxxx" }),
  });

  const { recordIntegrationError, mailAccountErrorKey } = await import("../src/notifications.js");
  recordIntegrationError(mailAccountErrorKey("gestoertes-konto"), "Postfach „Gestört“: Verbindung fehlgeschlagen", "IMAP prüfen.");

  const res = await api("/api/trust-status");
  const accounts = res.body.integrations.mail.accounts;
  const healthy = accounts.find((a) => a.id === "gesundes-konto");
  const broken = accounts.find((a) => a.id === "gestoertes-konto");
  assert.equal(healthy.lastError, null, "ein gesundes Konto darf durch den Fehler eines anderen Kontos nicht betroffen erscheinen");
  assert.ok(broken.lastError, "das gestörte Konto muss seinen eigenen Fehler zeigen");
});

test("GET /api/trust-status: letzte verifizierte Sicherung ist zunächst null, nach einem Export gesetzt", async () => {
  const before = await api("/api/trust-status");
  assert.equal(before.body.backup.lastVerifiedAt, null);

  const exportRes = await fetch(`${baseUrl}/api/backup`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(exportRes.status, 200);

  const after = await api("/api/trust-status");
  assert.ok(after.body.backup.lastVerifiedAt, "muss nach einem erfolgreichen, selbstverifizierten Export gesetzt sein");
});

test("GET /api/trust-status: Datenfrische spiegelt eine gerade angelegte Aufgabe wider", async () => {
  const before = await api("/api/trust-status");
  const beforeCount = before.body.dataFreshness.find((d) => d.table === "tasks").count;

  await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Frischetest" }) });

  const after = await api("/api/trust-status");
  const entry = after.body.dataFreshness.find((d) => d.table === "tasks");
  assert.equal(entry.count, beforeCount + 1);
  assert.ok(entry.lastUpdatedAt);
});

test("GET /api/trust-status: keine erfundenen ausstehenden Hintergrundjobs (kein Cron in dieser App)", async () => {
  const res = await api("/api/trust-status");
  assert.equal(res.body.pendingJobs.count, 0);
  assert.ok(res.body.pendingJobs.note.length > 0);
});
