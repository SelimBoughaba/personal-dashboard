// Deckt das Benachrichtigungszentrum ab (notifications.js, routes/
// notifications.js, Punkt 76): Fristen werden live aus tasks/invoices/
// contracts berechnet (nie gespeichert), Hintergrund-/Fehlerereignisse
// kommen aus notification_events, der Gelesen/Erledigt/Verschoben-Zustand
// aus notification_states - beides pro Schlüssel, einheitlich für beide
// Quellen.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addDays, todayIso } from "../src/recurrence.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-notifications-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;

const { app } = await import("../src/index.js");
const { recordBackgroundEvent, recordIntegrationError, clearIntegrationError } = await import("../src/notifications.js");

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

test("GET /api/notifications: überfällige und bald fällige offene Aufgaben erscheinen als Frist", async () => {
  const overdue = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Überfällige Testaufgabe", due_date: addDays(todayIso(), -3) }),
  });
  const soon = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Bald fällige Testaufgabe", due_date: addDays(todayIso(), 2) }),
  });
  const farAway = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Weit entfernte Testaufgabe", due_date: addDays(todayIso(), 30) }),
  });

  const res = await api("/api/notifications");
  assert.equal(res.status, 200);
  const keys = res.body.map((n) => n.key);
  assert.ok(keys.includes(`deadline:aufgabe:${overdue.body.id}`));
  assert.ok(keys.includes(`deadline:aufgabe:${soon.body.id}`));
  assert.ok(!keys.includes(`deadline:aufgabe:${farAway.body.id}`), "30 Tage entfernte Aufgabe darf noch nicht erscheinen");

  const overdueItem = res.body.find((n) => n.key === `deadline:aufgabe:${overdue.body.id}`);
  assert.equal(overdueItem.overdue, true);
  assert.equal(overdueItem.category, "deadline");
  assert.equal(overdueItem.path, "/aufgaben");

  const soonItem = res.body.find((n) => n.key === `deadline:aufgabe:${soon.body.id}`);
  assert.equal(soonItem.overdue, false);
});

test("GET /api/notifications: erledigte Aufgaben erzeugen keine Frist-Benachrichtigung mehr", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Wird gleich erledigt", due_date: addDays(todayIso(), -1) }),
  });
  let res = await api("/api/notifications");
  assert.ok(res.body.some((n) => n.key === `deadline:aufgabe:${created.body.id}`));

  await api(`/api/tasks/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "erledigt" }) });
  res = await api("/api/notifications");
  assert.ok(!res.body.some((n) => n.key === `deadline:aufgabe:${created.body.id}`));
});

test("PATCH /api/notifications/:key read/done/snoozedUntil steuern die aktive Liste", async () => {
  const created = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title: "Status-Test-Aufgabe", due_date: addDays(todayIso(), -1) }),
  });
  const key = `deadline:aufgabe:${created.body.id}`;

  // Gelesen: bleibt in der Liste, aber als gelesen markiert.
  const readRes = await api(`/api/notifications/${key}`, { method: "PATCH", body: JSON.stringify({ read: true }) });
  assert.equal(readRes.status, 200);
  let res = await api("/api/notifications");
  let item = res.body.find((n) => n.key === key);
  assert.equal(item.read, true);
  assert.equal(item.done, false);

  // Verschoben in die Zukunft: verschwindet aus der aktiven Liste.
  await api(`/api/notifications/${key}`, {
    method: "PATCH",
    body: JSON.stringify({ snoozedUntil: addDays(todayIso(), 5) }),
  });
  res = await api("/api/notifications");
  assert.ok(!res.body.some((n) => n.key === key));

  // Zurückgeholt (snoozedUntil in der Vergangenheit): wieder sichtbar.
  await api(`/api/notifications/${key}`, {
    method: "PATCH",
    body: JSON.stringify({ snoozedUntil: addDays(todayIso(), -1) }),
  });
  res = await api("/api/notifications");
  assert.ok(res.body.some((n) => n.key === key));

  // Erledigt: verschwindet dauerhaft aus der aktiven Liste.
  await api(`/api/notifications/${key}`, { method: "PATCH", body: JSON.stringify({ done: true }) });
  res = await api("/api/notifications");
  assert.ok(!res.body.some((n) => n.key === key));
});

test("PATCH /api/notifications/:key ohne gültiges Feld liefert 400", async () => {
  const res = await api("/api/notifications/irgendein-key", { method: "PATCH", body: JSON.stringify({}) });
  assert.equal(res.status, 400);
});

test("PATCH /api/notifications/:key lehnt ein ungültiges snoozedUntil-Format ab", async () => {
  const res = await api("/api/notifications/irgendein-key", {
    method: "PATCH",
    body: JSON.stringify({ snoozedUntil: "nicht-ein-datum" }),
  });
  assert.equal(res.status, 400);
});

test("recordBackgroundEvent legt ein Hintergrund-Ereignis an, ohne selbst irgendeinen Fehlerzustand aufzulösen", async () => {
  // Seit der Fehlerzustand pro Mail-Konto getrennt gehalten wird (Punkt 87,
  // siehe mailAccountErrorKey()/routes/invoices.js), löst
  // recordBackgroundEvent selbst KEINEN Fehlerzustand mehr auf - das war
  // früher ein hartcodiertes "error:mail", das ein gestörtes Konto fälschlich
  // neben einem funktionierenden zweiten hätte verschwinden lassen können.
  // Das Auflösen ist jetzt Sache des Aufrufers, gezielt pro Konto.
  recordIntegrationError("error:mail:test-account", "Mail-Verbindung fehlgeschlagen", "IMAP prüfen.");
  let res = await api("/api/notifications");
  assert.ok(res.body.some((n) => n.key === "error:mail:test-account" && n.category === "integration_error"));

  recordBackgroundEvent("background:mailscan:test-tag", "3 neue Rechnungsvorschläge", "Aus dem Mail-Scan.");
  res = await api("/api/notifications");
  assert.ok(res.body.some((n) => n.key === "background:mailscan:test-tag" && n.category === "background"));
  assert.ok(res.body.some((n) => n.key === "error:mail:test-account"), "recordBackgroundEvent darf fremde Fehlerzustände nicht anfassen");

  clearIntegrationError("error:mail:test-account");
});

test("recordBackgroundEvent ist idempotent für denselben Schlüssel (kein Duplikat, nur Aktualisierung)", async () => {
  recordBackgroundEvent("background:mailscan:idempotenz-test", "2 neue Rechnungsvorschläge", "Erster Lauf.");
  recordBackgroundEvent("background:mailscan:idempotenz-test", "5 neue Rechnungsvorschläge", "Zweiter Lauf.");
  const res = await api("/api/notifications");
  const matches = res.body.filter((n) => n.key === "background:mailscan:idempotenz-test");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].title, "5 neue Rechnungsvorschläge");
});

test("clearIntegrationError entfernt nur den passenden Fehlerzustand", async () => {
  recordIntegrationError("error:calendar", "Kalender-Verbindung fehlgeschlagen", "Prüfen.");
  clearIntegrationError("error:calendar");
  const res = await api("/api/notifications");
  assert.ok(!res.body.some((n) => n.key === "error:calendar"));
});
