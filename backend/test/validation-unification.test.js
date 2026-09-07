// Deckt Punkt 22 (einheitliche Validierung) und die dabei gefundene/
// behobene Regression ab: Aufgaben, Verträge, Ziele und LinkedIn-Beiträge
// nutzen jetzt gemeinsame Zod-Schemas (src/validation.js) statt pro Datei
// von Hand geschriebener Feld-für-Feld-Prüfungen. Notizen/Prompts wurden
// NICHT auf Zod umgestellt (andere Struktur, geringerer Nutzen), aber ein
// dabei entdeckter echter Bug wurde trotzdem behoben: PATCH erlaubte
// bisher, Titel/Inhalt auf leer zu setzen, obwohl POST genau das schon
// verhindert.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-validation-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;

const { app } = await import("../src/index.js");

let server;
let baseUrl;
let token;
let areaId;

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

  const areas = await fetch(`${baseUrl}/api/areas`, { headers: { Authorization: `Bearer ${token}` } }).then((r) =>
    r.json(),
  );
  areaId = areas[0].id;
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

// ---------------------------------------------------------------------
// Aufgaben (tasks.js) - erste auf Zod umgestellte Route
// ---------------------------------------------------------------------

test("POST /api/tasks: fehlender Titel wird abgelehnt, gültige Anfrage legt an", async () => {
  const missing = await api("/api/tasks", { method: "POST", body: JSON.stringify({}) });
  assert.equal(missing.status, 400);

  const whitespace = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "   " }) });
  assert.equal(whitespace.status, 400);

  const ok = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "  Wäsche waschen  " }) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.title, "Wäsche waschen"); // getrimmt
  assert.equal(ok.body.priority, "mittel"); // Standardwert
  assert.equal(ok.body.due_date, null);
});

test("POST /api/tasks: ungültige Priorität/Status/Bereich werden abgelehnt", async () => {
  const badPriority = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "x", priority: "dringend" }) });
  assert.equal(badPriority.status, 400);

  const badArea = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "x", area: "nicht-existent" }) });
  assert.equal(badArea.status, 400);
});

test("PATCH /api/tasks/:id: teilweises Update lässt nicht angegebene Felder unverändert", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Original", notes: "ursprüngliche Notiz", priority: "hoch" }),
  });
  assert.equal(created.status, 201);

  const patched = await api(`/api/tasks/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "erledigt" }),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.status, "erledigt");
  assert.equal(patched.body.title, "Original"); // unverändert
  assert.equal(patched.body.notes, "ursprüngliche Notiz"); // unverändert
  assert.equal(patched.body.priority, "hoch"); // unverändert
});

test("PATCH /api/tasks/:id: unbekannte ID liefert 404", async () => {
  const res = await api("/api/tasks/999999", { method: "PATCH", body: JSON.stringify({ title: "x" }) });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------
// Verträge (contracts.js) - inkl. Kosten-/Kündigungsfrist-Sonderfällen
// ---------------------------------------------------------------------

test("POST /api/contracts: Kosten und Kündigungsfrist akzeptieren leer/null, lehnen Unsinn ab", async () => {
  const empty = await api("/api/contracts", { method: "POST", body: JSON.stringify({ title: "Fitnessstudio", cost: "" }) });
  assert.equal(empty.status, 201);
  assert.equal(empty.body.cost, null);

  const infinity = await api("/api/contracts", { method: "POST", body: JSON.stringify({ title: "x", cost: "Infinity" }) });
  assert.equal(infinity.status, 400);

  const negativeDays = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({ title: "x", cancellation_period_days: -5 }),
  });
  assert.equal(negativeDays.status, 400);

  const valid = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({ title: "Internet", cost: "39.99", cancellation_period_days: 30 }),
  });
  assert.equal(valid.status, 201);
  assert.equal(valid.body.cost, 39.99);
  assert.equal(valid.body.cancellation_period_days, 30);
});

test("PATCH /api/contracts/:id: Kosten weglassen lässt bestehenden Wert unangetastet", async () => {
  const created = await api("/api/contracts", { method: "POST", body: JSON.stringify({ title: "x", cost: "10" }) });
  const patched = await api(`/api/contracts/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ title: "Neuer Titel" }),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.cost, 10); // NICHT auf null zurückgesetzt
});

// ---------------------------------------------------------------------
// Ziele (goals.js) - inkl. Meilensteinen (der eigentliche Regressionsfund)
// ---------------------------------------------------------------------

test("POST /api/goals ohne milestones-Feld schlägt NICHT fehl (Regressionstest)", async () => {
  // Genau dieser Fall brach während der Umstellung: milestones fehlte im
  // Body, wurde aber trotzdem validiert und fälschlich abgelehnt.
  const res = await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "Marathon laufen" }) });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.milestones, []);
  assert.equal(res.body.progress, 0);
});

test("POST /api/goals mit ungültigen milestones wird abgelehnt", async () => {
  const res = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "x", milestones: [{ text: "" }] }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/goals/:id ohne milestones lässt bestehende Meilensteine unangetastet", async () => {
  const created = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "x", milestones: [{ text: "Schritt 1", done: false }] }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.milestones.length, 1);

  const patched = await api(`/api/goals/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "erreicht" }),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.milestones.length, 1); // unverändert
  assert.equal(patched.body.status, "erreicht");
});

// ---------------------------------------------------------------------
// LinkedIn-Beiträge (linkedinPosts.js) - inkl. Absturzrisiko bei
// nicht-String-Inhalt
// ---------------------------------------------------------------------

test("POST /api/linkedin-posts: nicht-String-Inhalt führt zu 400, nicht zu einem Absturz", async () => {
  const res = await api("/api/linkedin-posts", { method: "POST", body: JSON.stringify({ content: 12345 }) });
  assert.equal(res.status, 400);
});

test("POST /api/linkedin-posts: leerer/fehlender Inhalt wird abgelehnt, gültiger Inhalt angenommen", async () => {
  const empty = await api("/api/linkedin-posts", { method: "POST", body: JSON.stringify({ content: "   " }) });
  assert.equal(empty.status, 400);

  const ok = await api("/api/linkedin-posts", { method: "POST", body: JSON.stringify({ content: "Mein Beitrag" }) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.status, "entwurf");
});

// ---------------------------------------------------------------------
// Notizen/Prompts - gezielter Bugfix (keine Zod-Umstellung, siehe oben)
// ---------------------------------------------------------------------

test("PATCH /api/notes/:id kann Titel und Inhalt nicht beide gleichzeitig auf leer setzen", async () => {
  const created = await api("/api/notes", {
    method: "POST",
    body: JSON.stringify({ title: "Titel", content: "Inhalt", area: areaId, tags: [] }),
  });
  assert.equal(created.status, 201);

  // Zuerst nur den Titel leeren - Inhalt bleibt vorhanden, muss erlaubt sein.
  const clearTitle = await api(`/api/notes/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ title: "" }) });
  assert.equal(clearTitle.status, 200);

  // Jetzt auch noch den Inhalt leeren - das darf nicht mehr durchgehen.
  const clearContentToo = await api(`/api/notes/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ content: "" }),
  });
  assert.equal(clearContentToo.status, 400);
});

test("PATCH /api/prompts/:id kann Titel oder Prompt-Text nicht auf leer setzen", async () => {
  const created = await api("/api/prompts", {
    method: "POST",
    body: JSON.stringify({ title: "Titel", content: "Inhalt" }),
  });
  assert.equal(created.status, 201);

  const clearTitle = await api(`/api/prompts/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ title: "" }) });
  assert.equal(clearTitle.status, 400);

  const clearContent = await api(`/api/prompts/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ content: "  " }),
  });
  assert.equal(clearContent.status, 400);
});
