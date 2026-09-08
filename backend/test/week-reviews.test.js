// Deckt den Wochenrückblick ab (routes/weekReviews.js, Punkt 68): eine
// offene Woche wird live aus tasks/invoices/contracts berechnet, ein
// abgeschlossener Rückblick wird als datensparsamer Snapshot gespeichert
// und bleibt danach unverändert (kein erneutes Überschreiben bei
// wiederholtem Schließen).
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startOfWeek, addDays, todayIso } from "../src/recurrence.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-week-reviews-"));
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

test("GET /api/week-reviews/:weekStart: normalisiert ein beliebiges Datum auf den Montag der Woche", async () => {
  // Ein Mittwoch (kein Montag) wird als weekStart übergeben.
  const wednesday = "2026-09-09"; // Mittwoch
  const res = await api(`/api/week-reviews/${wednesday}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.weekStart, "2026-09-07"); // Montag derselben Woche
  assert.equal(res.body.closed, false);
});

test("GET /api/week-reviews/:weekStart: zählt erledigte, liegengebliebene und kommende Fristen korrekt", async () => {
  // "Erledigt" wird über updated_at erkannt, das die Datenbank selbst auf
  // die tatsächliche Serverzeit setzt (kein vom Client vorgebbares Feld,
  // siehe routes/tasks.js) - deshalb muss dieser Test die ECHTE aktuelle
  // Woche verwenden, nicht ein beliebiges Testdatum.
  const weekStart = startOfWeek(todayIso());
  const weekEnd = addDays(weekStart, 6);

  // Erledigte Aufgabe DIESE Woche (updated_at fällt in den Bereich, weil
  // sofort nach dem Anlegen erledigt).
  const done = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Diese Woche erledigt" }) });
  await api(`/api/tasks/${done.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "erledigt" }) });

  // Liegengebliebene Aufgabe: offen, fällig innerhalb der Woche.
  await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Liegengeblieben", due_date: weekEnd }) });

  // Kommende Frist: offene Aufgabe, fällig in der Folgewoche.
  await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Bald fällig", due_date: addDays(weekEnd, 3) }),
  });

  const res = await api(`/api/week-reviews/${weekStart}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.completed.some((t) => t.title === "Diese Woche erledigt"));
  assert.ok(res.body.leftover.some((t) => t.title === "Liegengeblieben"));
  assert.ok(res.body.upcomingDeadlines.some((d) => d.title === "Bald fällig" && d.type === "aufgabe"));
});

test("POST /api/week-reviews/:weekStart/close speichert einen Snapshot, GET liefert danach den gespeicherten Stand", async () => {
  const weekStart = "2026-02-02"; // ein Montag

  const closed = await api(`/api/week-reviews/${weekStart}/close`, { method: "POST" });
  assert.equal(closed.status, 201);
  assert.equal(closed.body.closed, true);
  assert.ok(closed.body.closedAt);
  assert.equal(typeof closed.body.completedCount, "number");

  const listed = await api("/api/week-reviews");
  assert.ok(listed.body.some((r) => r.weekStart === weekStart));

  const fetched = await api(`/api/week-reviews/${weekStart}`);
  assert.equal(fetched.body.closed, true);
  assert.equal(fetched.body.completedCount, closed.body.completedCount);
});

test("POST .../close ist idempotent: ein zweiter Aufruf ändert den gespeicherten Snapshot nicht, auch wenn sich die Daten seither geändert haben", async () => {
  const weekStart = "2026-03-02"; // ein Montag
  const weekEnd = addDays(weekStart, 6);

  await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Vor dem Schließen", due_date: weekEnd }) });
  const first = await api(`/api/week-reviews/${weekStart}/close`, { method: "POST" });
  assert.equal(first.status, 201);
  const leftoverAfterFirstClose = first.body.leftoverCount;

  // Nach dem Schließen entsteht eine weitere liegengebliebene Aufgabe - der
  // bereits gespeicherte Snapshot darf sich dadurch NICHT mehr ändern.
  await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Nach dem Schließen", due_date: weekEnd }) });

  const second = await api(`/api/week-reviews/${weekStart}/close`, { method: "POST" });
  assert.equal(second.status, 200); // kein 201 - nichts Neues angelegt
  assert.equal(second.body.leftoverCount, leftoverAfterFirstClose);
  assert.equal(second.body.closedAt, first.body.closedAt);
});

test("GET /api/week-reviews/:weekStart lehnt ein ungültiges Datumsformat ab", async () => {
  const res = await api("/api/week-reviews/nicht-ein-datum");
  assert.equal(res.status, 400);
});

test("startOfWeek liefert für jeden Wochentag denselben Montag", () => {
  assert.equal(startOfWeek("2026-09-07"), "2026-09-07"); // Montag selbst
  assert.equal(startOfWeek("2026-09-13"), "2026-09-07"); // Sonntag derselben Woche
  assert.equal(startOfWeek("2026-09-09"), "2026-09-07"); // Mittwoch derselben Woche
});
