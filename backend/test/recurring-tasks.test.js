// Deckt die Verdrahtung wiederkehrender Aufgaben in routes/tasks.js ab
// (Punkt 66): Abschließen einer wiederkehrenden Aufgabe erzeugt die
// nächste Instanz, Löschen einer offenen Instanz überspringt sie statt die
// Serie zu beenden, ein Enddatum beendet die Serie tatsächlich, und die
// Wiederholungsregel lässt sich wieder entfernen. Die reine Datumsarithmetik
// selbst ist in recurrence.test.js abgedeckt - hier geht es um das
// Zusammenspiel mit der Datenbank/den Routen.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-recurring-tasks-"));
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

test("POST /api/tasks: Wiederholungsregel wird gespeichert und als Objekt zurückgegeben (nicht als roher JSON-Text)", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "Müll rausbringen",
      due_date: "2026-03-10",
      recurrence: { freq: "weekly", interval: 1, mode: "fest" },
    }),
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.recurrence, {
    freq: "weekly",
    interval: 1,
    mode: "fest",
    weekdaysOnly: false,
    until: null,
  });
});

test("POST /api/tasks: ungültige Wiederholungsregel wird abgelehnt", async () => {
  const badFreq = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "x", recurrence: { freq: "jährlich", interval: 1, mode: "fest" } }),
  });
  assert.equal(badFreq.status, 400);

  const badInterval = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "x", recurrence: { freq: "daily", interval: 0, mode: "fest" } }),
  });
  assert.equal(badInterval.status, 400);
});

test("PATCH auf 'erledigt' erzeugt bei wiederkehrender Aufgabe die nächste Instanz, die erledigte Aufgabe bleibt erledigt", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "Wasserpflanzen gießen",
      due_date: "2026-04-01",
      recurrence: { freq: "weekly", interval: 1, mode: "fest" },
    }),
  });
  const taskId = created.body.id;

  const completed = await api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: "erledigt" }) });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.status, "erledigt");
  assert.ok(completed.body.followUp);
  assert.equal(completed.body.followUp.status, "offen");
  assert.equal(completed.body.followUp.title, "Wasserpflanzen gießen");
  assert.deepEqual(completed.body.followUp.recurrence, completed.body.recurrence);

  const all = await api("/api/tasks");
  const rows = all.body.filter((t) => t.title === "Wasserpflanzen gießen");
  assert.equal(rows.length, 2); // Original (erledigt) + Folgeinstanz (offen)
});

test("PATCH auf 'erledigt' ohne Wiederholungsregel erzeugt keine Folgeinstanz", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Einmalige Sache" }) });
  const completed = await api(`/api/tasks/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "erledigt" }),
  });
  assert.equal(completed.body.followUp, null);
});

test("DELETE einer offenen wiederkehrenden Aufgabe überspringt sie, statt die Serie zu beenden", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "Rechnung prüfen (monatlich)",
      due_date: "2026-05-01",
      recurrence: { freq: "monthly", interval: 1, mode: "fest" },
    }),
  });

  const deleted = await api(`/api/tasks/${created.body.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);

  const all = await api("/api/tasks");
  const rows = all.body.filter((t) => t.title === "Rechnung prüfen (monatlich)");
  assert.equal(rows.length, 1); // die übersprungene Instanz ist weg, die Folgeinstanz existiert
  assert.equal(rows[0].status, "offen");
  assert.notEqual(rows[0].id, created.body.id);
});

test("Enddatum der Serie: nach dem Enddatum wird keine Folgeinstanz mehr erzeugt", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "Befristete Wiederholung",
      due_date: "2026-06-10",
      recurrence: { freq: "daily", interval: 1, mode: "fest", until: "2026-06-10" },
    }),
  });

  const completed = await api(`/api/tasks/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "erledigt" }),
  });
  assert.equal(completed.body.followUp, null); // 2026-06-11 läge nach dem Enddatum
});

test("PATCH recurrence:null entfernt die Wiederholung - Abschließen erzeugt danach keine Folgeinstanz mehr", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "Doch nicht wiederkehrend",
      due_date: "2026-07-01",
      recurrence: { freq: "daily", interval: 1, mode: "fest" },
    }),
  });
  assert.ok(created.body.recurrence);

  const cleared = await api(`/api/tasks/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ recurrence: null }) });
  assert.equal(cleared.body.recurrence, null);

  const completed = await api(`/api/tasks/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "erledigt" }),
  });
  assert.equal(completed.body.followUp, null);
});
