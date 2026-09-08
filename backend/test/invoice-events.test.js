// Deckt die belegte Ereignisfolge einer Rechnung ab (routes/invoices.js,
// Migration 0021, Punkt 57 - eine der fünf Signatur-Stellen): confirmed_at/
// paid_at werden genau bei einem echten Übergang gesetzt (sticky bei
// wiederholtem Speichern) und beim Rückgängigmachen wieder gelöscht, statt
// ein inzwischen falsches Datum stehen zu lassen. "Nur tatsächlich
// gespeicherte Schritte zeigen" gilt also auch für einen widerrufenen
// Schritt.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-invoice-events-"));
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

test("POST /api/invoices: manuell angelegt und sofort bestätigt setzt confirmed_at, unbestätigt lässt es leer", async () => {
  const confirmed = await api("/api/invoices", { method: "POST", body: JSON.stringify({ subject: "Sofort bestätigt" }) });
  assert.equal(confirmed.body.confirmed, 1);
  assert.ok(confirmed.body.confirmed_at, "confirmed_at muss bei sofort bestätigter Rechnung gesetzt sein");
  assert.equal(confirmed.body.paid_at, null, "paid_at darf ohne Status 'bezahlt' nicht gesetzt sein");

  const unconfirmed = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Unbestätigter Vorschlag", confirmed: false }),
  });
  assert.equal(unconfirmed.body.confirmed, 0);
  assert.equal(unconfirmed.body.confirmed_at, null);
});

test("POST /api/invoices: sofort mit Status 'bezahlt' angelegt setzt paid_at", async () => {
  const paid = await api("/api/invoices", { method: "POST", body: JSON.stringify({ subject: "Direkt bezahlt", status: "bezahlt" }) });
  assert.ok(paid.body.paid_at, "paid_at muss gesetzt sein");
});

test("PATCH /api/invoices/:id: Bestätigen setzt confirmed_at genau einmal (sticky bei erneutem Speichern)", async () => {
  const created = await api("/api/invoices", { method: "POST", body: JSON.stringify({ subject: "Wird bestätigt", confirmed: false }) });
  assert.equal(created.body.confirmed_at, null);

  const confirmed = await api(`/api/invoices/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ confirmed: true }) });
  assert.ok(confirmed.body.confirmed_at);
  const firstTimestamp = confirmed.body.confirmed_at;

  // Erneutes Speichern (z. B. Bearbeiten und wieder confirmed:true schicken)
  // darf den ursprünglichen Zeitpunkt nicht überschreiben.
  await new Promise((r) => setTimeout(r, 20));
  const resaved = await api(`/api/invoices/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ subject: "Wird bestätigt (bearbeitet)", confirmed: true }),
  });
  assert.equal(resaved.body.confirmed_at, firstTimestamp);
});

test("PATCH /api/invoices/:id: Status auf 'bezahlt' setzt paid_at, zurück auf 'offen' löscht es wieder", async () => {
  const created = await api("/api/invoices", { method: "POST", body: JSON.stringify({ subject: "Zahlungs-Test" }) });
  assert.equal(created.body.paid_at, null);

  const paid = await api(`/api/invoices/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "bezahlt" }) });
  assert.ok(paid.body.paid_at);

  const reverted = await api(`/api/invoices/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ status: "offen" }) });
  assert.equal(reverted.body.paid_at, null, "paid_at muss beim Zurücksetzen auf 'offen' wieder gelöscht werden");
});

test("PATCH /api/invoices/:id: erneutes Markieren als 'bezahlt' setzt paid_at sticky (kein neuer Zeitpunkt bei reinem Re-Save)", async () => {
  const created = await api("/api/invoices", { method: "POST", body: JSON.stringify({ subject: "Bezahlt-Sticky-Test", status: "bezahlt" }) });
  const firstPaidAt = created.body.paid_at;
  assert.ok(firstPaidAt);

  await new Promise((r) => setTimeout(r, 20));
  const resaved = await api(`/api/invoices/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ subject: "Bezahlt-Sticky-Test (bearbeitet)", status: "bezahlt" }),
  });
  assert.equal(resaved.body.paid_at, firstPaidAt);
});
