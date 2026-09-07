// Integrationstests gegen eine frische, isolierte Testdatenbank (eigenes
// Temp-Verzeichnis über DASHBOARD_DATA_DIR – siehe db.js/documentStorage.js).
// Lauf: `npm test` in backend/. Nutzt Node's eingebauten Testrunner, keine
// zusätzliche Test-Abhängigkeit nötig.
//
// Deckt die in dieser Runde behobenen Punkte ab (siehe Commit-Beschreibung):
// atomare Ersteinrichtung, Session-Widerruf bei Passwortwechsel, Backup-
// Validierung/Pfadsicherheit, Ausschluss von Auth-Secrets aus Backups, die
// Settings-Routenreihenfolge (Kalender-Trennung) und den globalen vs.
// erhöhten Body-Size-Limit.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;
process.env.JWT_SECRET = ""; // erzwingt automatische Zufallserzeugung, wie im echten Ersteinrichtungspfad

const { app } = await import("../src/index.js");
const { resolveStoredDocumentPath, generateStoredName, STORED_NAME_PATTERN } = await import(
  "../src/documentStorage.js"
);

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(reqPath, options = {}) {
  const res = await fetch(`${baseUrl}${reqPath}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
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

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------
// Punkt 6: Ersteinrichtung muss atomar sein
// ---------------------------------------------------------------------

let winningPassword;
let token;

test("concurrent setup: exactly one of two simultaneous requests succeeds", async () => {
  const attempts = ["password-one", "password-two"];
  const results = await Promise.all(
    attempts.map((password) => api("/api/auth/setup", { method: "POST", body: JSON.stringify({ password }) })),
  );
  const successes = results.filter((r) => r.status === 201);
  const failures = results.filter((r) => r.status === 403);
  assert.equal(successes.length, 1, "genau ein Request darf erfolgreich sein");
  assert.equal(failures.length, 1, "der andere muss mit 403 abgelehnt werden");
  assert.ok(successes[0].body.token);

  winningPassword = attempts[results.indexOf(successes[0])];
  token = successes[0].body.token;
});

test("a third setup attempt after the race is also rejected", async () => {
  const res = await api("/api/auth/setup", { method: "POST", body: JSON.stringify({ password: "password-three" }) });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------------
// Punkt 7 & 8: Session-Widerruf, Passwort-Härtung
// ---------------------------------------------------------------------

test("password change revokes the old token but hands back a working new one", async () => {
  const oldToken = token;
  const res = await api("/api/auth/password", {
    method: "PATCH",
    headers: auth(oldToken),
    body: JSON.stringify({ currentPassword: winningPassword, newPassword: "password-one-v2" }),
  });
  assert.equal(res.status, 200);
  assert.ok(res.body.token, "Antwort muss ein frisches Token enthalten");
  assert.notEqual(res.body.token, oldToken);

  const withOldToken = await api("/api/tasks", { headers: auth(oldToken) });
  assert.equal(withOldToken.status, 401, "altes Token muss nach Passwortwechsel abgelehnt werden");

  const withNewToken = await api("/api/tasks", { headers: auth(res.body.token) });
  assert.equal(withNewToken.status, 200, "neues Token aus derselben Antwort muss weiterhin funktionieren");

  token = res.body.token;
  winningPassword = "password-one-v2";
});

test("password longer than 72 UTF-8 bytes is rejected, not silently truncated", async () => {
  const res = await api("/api/auth/password", {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify({ currentPassword: winningPassword, newPassword: "a".repeat(100) }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /72/);
});

test("global 1MB JSON body limit is still enforced on an ordinary route", async () => {
  const res = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify({ title: "x".repeat(2 * 1024 * 1024) }),
  });
  assert.equal(res.status, 413);
});

// ---------------------------------------------------------------------
// Punkt 13: Settings-Routenreihenfolge (Kalender-Trennung)
// ---------------------------------------------------------------------

test("DELETE /settings/calendar actually clears the stored iCloud config", async () => {
  const set = await api("/api/settings/calendar", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ username: "me@icloud.com", appPassword: "xxxx-xxxx-xxxx-xxxx" }),
  });
  assert.equal(set.status, 200);

  const configured = await api("/api/settings/calendar", { headers: auth(token) });
  assert.equal(configured.body.configured, true);

  const del = await api("/api/settings/calendar", { method: "DELETE", headers: auth(token) });
  assert.equal(del.status, 204);

  const afterDelete = await api("/api/settings/calendar", { headers: auth(token) });
  assert.equal(afterDelete.body.configured, false, "Kalender muss nach DELETE wirklich als nicht konfiguriert gelten");
});

// ---------------------------------------------------------------------
// Punkte 3+4: Auth-Secrets nie im Backup
// ---------------------------------------------------------------------

let baseBackup;

test("backup export never contains auth.* settings", async () => {
  const res = await api("/api/backup", { headers: auth(token) });
  assert.equal(res.status, 200);
  const authKeys = Object.keys(res.body.settings).filter((k) => k.startsWith("auth."));
  assert.deepEqual(authKeys, []);
  baseBackup = res.body;
});

// ---------------------------------------------------------------------
// Punkt 2: strikte, typisierte Restore-Validierung
// ---------------------------------------------------------------------

function cloneBackup() {
  return JSON.parse(JSON.stringify(baseBackup));
}

test("restore rejects a path-traversal stored_name before touching the DB", async () => {
  const b = cloneBackup();
  b.documents.push({
    id: 9999,
    title: "evil",
    file_name: "evil.txt",
    stored_name: "../../../../etc/passwd",
    mime_type: "text/plain",
    size: 10,
    area: b.areas[0].id,
    tags: "[]",
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
  });
  const res = await api("/api/backup/preview", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ data: b }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.valid, false);
  assert.match(res.body.error, /stored_name/);
});

test("restore rejects an invalid enum value with a field-specific message", async () => {
  const b = cloneBackup();
  b.tasks.push({
    id: 1,
    title: "x",
    notes: "",
    due_date: null,
    priority: "SUPER_URGENT",
    area: b.areas[0].id,
    status: "offen",
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
  });
  const res = await api("/api/backup/preview", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ data: b }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /priority/);
});

test("restore rejects a dangling area reference", async () => {
  const b = cloneBackup();
  b.tasks.push({
    id: 1,
    title: "x",
    notes: "",
    due_date: null,
    priority: "mittel",
    area: "does-not-exist",
    status: "offen",
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
  });
  const res = await api("/api/backup/preview", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ data: b }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /nicht definiert/);
});

test("restore requires confirm to be the literal boolean true", async () => {
  const b = cloneBackup();
  const res = await api("/api/backup/restore", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ data: b, confirm: "true" }), // String statt boolean
  });
  assert.equal(res.status, 400);
});

test("restore silently drops forged auth.* settings and leaves the current session intact", async () => {
  const b = cloneBackup();
  b.settings["auth.jwt_secret"] = "attacker-controlled-secret";
  b.settings["auth.password_hash"] = "$2a$12$forgedforgedforgedforgedforgedforgedforgedforgedforge";
  b.settings["auth.token_version"] = 99999;

  const res = await api("/api/backup/restore", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ data: b, confirm: true }),
  });
  assert.equal(res.status, 200);

  const stillWorks = await api("/api/tasks", { headers: auth(token) });
  assert.equal(stillWorks.status, 200, "die reale, unveränderte Sitzung darf durch das Restore nicht ungültig werden");
});

test("restore round-trip preserves data and accepts a body over the global 1MB limit", async () => {
  const b = cloneBackup();
  b.notes = [];
  for (let i = 0; i < 3000; i++) {
    b.notes.push({
      id: i + 1,
      title: `n${i}`,
      content: "x".repeat(500),
      area: b.areas[0].id,
      tags: "[]",
      pinned: 0,
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    });
  }
  const payload = JSON.stringify({ data: b, confirm: true });
  assert.ok(Buffer.byteLength(payload) > 1024 * 1024, "Testkörper muss tatsächlich über 1MB liegen");

  const res = await fetch(`${baseUrl}/api/backup/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: payload,
  });
  assert.equal(res.status, 200);

  const notes = await api("/api/notes", { headers: auth(token) });
  assert.equal(notes.body.length, 3000);
});

// ---------------------------------------------------------------------
// Punkt 1: Dokumentpfad-Absicherung (Unit-Ebene, unabhängig vom Restore-Pfad)
// ---------------------------------------------------------------------

test("resolveStoredDocumentPath rejects traversal, absolute paths and separators", () => {
  const attempts = [
    "../../../../etc/passwd",
    "/etc/passwd",
    "..\\..\\windows\\system32\\config",
    "1234-abcdef0123456789/../../secret",
    "not-even-the-right-shape.txt",
    "",
    null,
    undefined,
  ];
  for (const attempt of attempts) {
    assert.equal(resolveStoredDocumentPath(attempt), null, `sollte abgelehnt werden: ${attempt}`);
  }
});

test("resolveStoredDocumentPath accepts exactly what generateStoredName produces", () => {
  for (const original of ["Rechnung.pdf", "no-extension", "weird...name.PDF", "trailing.", ".hidden"]) {
    const generated = generateStoredName(original);
    assert.match(generated, STORED_NAME_PATTERN, `generateStoredName("${original}") -> "${generated}" muss zum eigenen Muster passen`);
    const resolved = resolveStoredDocumentPath(generated);
    assert.ok(resolved, `resolveStoredDocumentPath sollte einen von generateStoredName("${original}") erzeugten Namen akzeptieren`);
    assert.ok(resolved.startsWith(path.resolve(tmpDir)), "aufgelöster Pfad muss innerhalb des Datenverzeichnisses liegen");
  }
});

// ---------------------------------------------------------------------
// Punkt 12 (npm audit): qs hat zwei moderate Advisories (Array-Limit-
// Umgehung, DoS über isBuffer), erreichbar über Express' standardmäßigen
// "extended" Query-Parser. Ein Fix ist nur über Express 5 verfügbar
// (Major-Update). Diese App nutzt nirgends qs' erweiterte Syntax, daher
// stattdessen auf Express' eingebauten "simple"-Parser (Node's
// querystring-Modul, nicht von den qs-Advisories betroffen) umgestellt -
// ohne Express selbst aktualisieren zu müssen.
// ---------------------------------------------------------------------

test("query parser ist auf 'simple' gesetzt (qs-Sicherheitslücken werden dadurch nie erreicht)", () => {
  assert.equal(app.get("query parser"), "simple");
});

test("Klammer-artige Query-Strings bringen den Server nicht zum Absturz", async () => {
  const res = await fetch(`${baseUrl}/api/tasks?filter[status]=offen&arr[]=1&arr[]=2`, {
    headers: { Authorization: "Bearer ungueltig" },
  });
  // Ohne gültigen Token wird die Anfrage regulär mit 401 abgelehnt - der
  // eigentliche Punkt hier ist, dass die Anfrage überhaupt sauber
  // durchläuft (kein 500er/Absturz) und der Klammer-Query nicht als von
  // qs verschachteltes Objekt interpretiert wird (siehe expliziter
  // Parser-Test oben).
  assert.equal(res.status, 401);
});
