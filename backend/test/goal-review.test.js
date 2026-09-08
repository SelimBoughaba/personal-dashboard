// Deckt den Überprüfungsturnus für Ziele ab (routes/goals.js, Punkt 78):
// Setzen eines Turnus berechnet automatisch ein erstes Überprüfungsdatum,
// "Jetzt überprüft" rechnet server-seitig zum nächsten Termin weiter, und
// das Entfernen des Turnus räumt das Datum mit auf statt es verwaist
// stehen zu lassen.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeNextOccurrence, todayIso } from "../src/recurrence.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-goal-review-"));
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

test("POST /api/goals: review_freq setzen berechnet automatisch ein erstes next_review_date", async () => {
  const created = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "Fitness verbessern", review_freq: "monthly" }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.review_freq, "monthly");
  assert.ok(created.body.next_review_date); // ein Datum wurde berechnet, nicht null
});

test("POST /api/goals: ohne review_freq bleibt next_review_date null", async () => {
  const created = await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "Ohne Turnus" }) });
  assert.equal(created.body.review_freq, null);
  assert.equal(created.body.next_review_date, null);
});

test("POST /api/goals/:id/mark-reviewed rechnet ab einem zukünftigen next_review_date weiter", async () => {
  // Absichtlich ein Datum in der Zukunft relativ zu "heute" (nicht
  // überfällig) - so ist das Ergebnis unabhängig vom tatsächlichen
  // Testlauf-Datum vorhersagbar: die Basis ist garantiert das gesetzte
  // Datum selbst, nicht "heute" (siehe nächster Test für den überfälligen Fall).
  const future = computeNextOccurrence(todayIso(), { freq: "monthly", interval: 6 });
  const created = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "Sprache lernen", review_freq: "quarterly", next_review_date: future }),
  });
  assert.equal(created.body.next_review_date, future);

  const reviewed = await api(`/api/goals/${created.body.id}/mark-reviewed`, { method: "POST" });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.next_review_date, computeNextOccurrence(future, { freq: "monthly", interval: 3 }));
});

test("POST /api/goals/:id/mark-reviewed rechnet bei überfälligem next_review_date ab heute weiter (kein Rückstand in der Vergangenheit)", async () => {
  const overdue = "2020-01-01"; // garantiert in der Vergangenheit
  const created = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "Lange überfällige Überprüfung", review_freq: "monthly", next_review_date: overdue }),
  });

  const reviewed = await api(`/api/goals/${created.body.id}/mark-reviewed`, { method: "POST" });
  assert.equal(reviewed.body.next_review_date, computeNextOccurrence(todayIso(), { freq: "monthly", interval: 1 }));
  assert.ok(reviewed.body.next_review_date >= todayIso()); // nie ein Ergebnis in der Vergangenheit
});

test("POST /api/goals/:id/mark-reviewed ohne Turnus wird abgelehnt", async () => {
  const created = await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "Kein Turnus hier" }) });
  const reviewed = await api(`/api/goals/${created.body.id}/mark-reviewed`, { method: "POST" });
  assert.equal(reviewed.status, 400);
});

test("PATCH review_freq auf null entfernt auch next_review_date", async () => {
  const created = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "Turnus wird entfernt", review_freq: "yearly" }),
  });
  assert.ok(created.body.next_review_date);

  const cleared = await api(`/api/goals/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ review_freq: null }) });
  assert.equal(cleared.body.review_freq, null);
  assert.equal(cleared.body.next_review_date, null);
});

test("PATCH review_freq-Wechsel ohne eigenes Datum berechnet next_review_date neu", async () => {
  const created = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "Turnus wechseln", review_freq: "monthly", next_review_date: "2026-01-10" }),
  });

  const changed = await api(`/api/goals/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ review_freq: "yearly" }),
  });
  assert.equal(changed.body.review_freq, "yearly");
  assert.notEqual(changed.body.next_review_date, "2026-01-10"); // neu berechnet, nicht das alte Datum stehen gelassen
});

test("POST /api/goals: ungültiger review_freq wird abgelehnt", async () => {
  const res = await api("/api/goals", { method: "POST", body: JSON.stringify({ title: "x", review_freq: "woechentlich" }) });
  assert.equal(res.status, 400);
});
