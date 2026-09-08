// Deckt die Fristenradar-Ausbaustufe ab (Punkt 70, siehe
// backend/src/contractReview.js): "Erinnerung und eine lokal erstellte
// Prüfaufgabe bilden die erste Ausbaustufe." - eine automatisch angelegte,
// mit dem Vertrag verknüpfte Aufgabe, sobald die Kündigungsfrist innerhalb
// der Schwelle liegt, ohne Dubletten bei wiederholtem Abruf und mit
// korrektem Zurücksetzen bei einer geänderten Frist.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-contract-review-"));
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

function isoDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test("GET /api/contracts: legt für eine bald ablaufende Kündigungsfrist automatisch eine verlinkte Aufgabe an", async () => {
  const created = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Fitnessstudio-Vertrag",
      provider: "Fit GmbH",
      billing_cycle: "monatlich",
      next_renewal_date: isoDatePlusDays(10),
      cancellation_period_days: 5, // Frist endet in 5 Tagen - innerhalb der 30-Tage-Schwelle
    }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.review_task_id, null);
  const contractId = created.body.id;

  const list = await api("/api/contracts");
  const contract = list.body.find((c) => c.id === contractId);
  assert.ok(contract.review_task_id, "review_task_id sollte nach dem Abruf gesetzt sein");

  const tasks = await api("/api/tasks");
  const task = tasks.body.find((t) => t.id === contract.review_task_id);
  assert.ok(task, "die referenzierte Aufgabe muss existieren");
  assert.match(task.title, /Fitnessstudio-Vertrag/);
  assert.equal(task.priority, "hoch");
  assert.equal(task.status, "offen");

  const links = await api(`/api/links?type=vertrag&id=${contractId}`);
  assert.ok(links.body.some((l) => l.type === "aufgabe" && l.id === task.id), "Vertrag und Aufgabe müssen verknüpft sein");
});

test("GET /api/contracts: ein zweiter Abruf legt keine zweite Aufgabe für dieselbe Frist an", async () => {
  const created = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Zeitschriftenabo",
      billing_cycle: "jaehrlich",
      next_renewal_date: isoDatePlusDays(15),
      cancellation_period_days: 3,
    }),
  });
  const contractId = created.body.id;

  await api("/api/contracts"); // erster Abruf legt die Aufgabe an
  const afterFirst = (await api("/api/contracts")).body.find((c) => c.id === contractId);
  const taskId = afterFirst.review_task_id;
  assert.ok(taskId);

  await api("/api/contracts"); // zweiter Abruf
  const afterSecond = (await api("/api/contracts")).body.find((c) => c.id === contractId);
  assert.equal(afterSecond.review_task_id, taskId, "review_task_id darf sich nicht ändern");

  const tasks = await api("/api/tasks");
  const matching = tasks.body.filter((t) => t.title.includes("Zeitschriftenabo"));
  assert.equal(matching.length, 1, "es darf nur eine Prüfaufgabe für diesen Vertrag geben");
});

test("GET /api/contracts: eine weit entfernte oder unklare Frist erzeugt keine Aufgabe", async () => {
  const farAway = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Vertrag mit ferner Frist",
      billing_cycle: "jaehrlich",
      next_renewal_date: isoDatePlusDays(200),
      cancellation_period_days: 5, // Frist liegt weit außerhalb der 30-Tage-Schwelle
    }),
  });
  const noDeadline = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Vertrag ohne Kündigungsfrist-Angabe",
      billing_cycle: "monatlich",
      next_renewal_date: isoDatePlusDays(5),
      // cancellation_period_days bewusst nicht gesetzt -> keine berechenbare Frist
    }),
  });

  await api("/api/contracts");
  const list = await api("/api/contracts");
  const a = list.body.find((c) => c.id === farAway.body.id);
  const b = list.body.find((c) => c.id === noDeadline.body.id);
  assert.equal(a.review_task_id, null);
  assert.equal(b.review_task_id, null);
});

test("PATCH /api/contracts/:id: eine geänderte Frist setzt review_task_id zurück, ein neuer Abruf legt eine neue Aufgabe an", async () => {
  const created = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Hosting-Vertrag",
      billing_cycle: "monatlich",
      next_renewal_date: isoDatePlusDays(12),
      cancellation_period_days: 2,
    }),
  });
  const contractId = created.body.id;

  await api("/api/contracts");
  const withTask = (await api("/api/contracts")).body.find((c) => c.id === contractId);
  const firstTaskId = withTask.review_task_id;
  assert.ok(firstTaskId);

  // Verlängerungsdatum ändert sich (neuer Vertragszyklus) - die alte Frist
  // ist damit überholt.
  const patched = await api(`/api/contracts/${contractId}`, {
    method: "PATCH",
    body: JSON.stringify({ next_renewal_date: isoDatePlusDays(20) }),
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.review_task_id, null, "review_task_id muss nach Friständerung zurückgesetzt sein");

  await api("/api/contracts");
  const afterPatch = (await api("/api/contracts")).body.find((c) => c.id === contractId);
  assert.ok(afterPatch.review_task_id, "für die neue Frist muss wieder eine Aufgabe entstehen");
  assert.notEqual(afterPatch.review_task_id, firstTaskId, "es muss eine NEUE Aufgabe sein, nicht dieselbe");

  // Die alte Aufgabe bleibt unangetastet bestehen (kein automatisches
  // Löschen/Verändern fremder Nutzerentscheidungen).
  const tasks = await api("/api/tasks");
  assert.ok(tasks.body.some((t) => t.id === firstTaskId));
});

test("PATCH /api/contracts/:id: unveränderte Frist lässt review_task_id unangetastet", async () => {
  const created = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Cloud-Speicher-Abo",
      billing_cycle: "monatlich",
      next_renewal_date: isoDatePlusDays(8),
      cancellation_period_days: 1,
    }),
  });
  const contractId = created.body.id;

  await api("/api/contracts");
  const withTask = (await api("/api/contracts")).body.find((c) => c.id === contractId);
  const taskId = withTask.review_task_id;
  assert.ok(taskId);

  const patched = await api(`/api/contracts/${contractId}`, { method: "PATCH", body: JSON.stringify({ provider: "Neuer Anbietername" }) });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.review_task_id, taskId, "unveränderte Frist darf review_task_id nicht zurücksetzen");
});
