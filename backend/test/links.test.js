// Deckt die neue Kontextlinks-Route (routes/links.js, Punkt 69 der
// Design-Erweiterung, Migration 0015) ab: manuell gesetzte, sichtbare
// Verknüpfungen zwischen zwei Objekten - Selbstverknüpfung, unbekannte
// Typen und nicht existierende Ziel-IDs müssen abgelehnt werden, ein
// doppeltes POST desselben Paares darf keine zweite Zeile anlegen, und
// GET muss von beiden Seiten aus dieselbe Verknüpfung mit aufgelöstem
// Titel liefern.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-links-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;

const { app } = await import("../src/index.js");

let server;
let baseUrl;
let token;
let taskId;
let contractId;

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

  const task = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Vertrag prüfen" }) });
  taskId = task.body.id;

  const contract = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({ title: "Bürovertrag", provider: "Vermieter GmbH", billing_cycle: "monatlich" }),
  });
  contractId = contract.body.id;
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

test("POST /api/links: gültige Verknüpfung anlegen, GET liefert sie von beiden Seiten mit aufgelöstem Titel", async () => {
  const created = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "aufgabe", a_id: taskId, b_type: "vertrag", b_id: contractId }),
  });
  assert.equal(created.status, 201);
  assert.ok(created.body.id);

  const fromTask = await api(`/api/links?type=aufgabe&id=${taskId}`);
  assert.equal(fromTask.status, 200);
  assert.equal(fromTask.body.length, 1);
  assert.equal(fromTask.body[0].type, "vertrag");
  assert.equal(fromTask.body[0].id, contractId);
  assert.equal(fromTask.body[0].title, "Bürovertrag");

  const fromContract = await api(`/api/links?type=vertrag&id=${contractId}`);
  assert.equal(fromContract.status, 200);
  assert.equal(fromContract.body.length, 1);
  assert.equal(fromContract.body[0].type, "aufgabe");
  assert.equal(fromContract.body[0].id, taskId);
  assert.equal(fromContract.body[0].title, "Vertrag prüfen");
});

test("POST /api/links: dasselbe Paar ein zweites Mal (auch vertauscht) erzeugt keine zweite Zeile", async () => {
  const before = await api(`/api/links?type=aufgabe&id=${taskId}`);
  assert.equal(before.body.length, 1);

  const again = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "vertrag", a_id: contractId, b_type: "aufgabe", b_id: taskId }),
  });
  assert.equal(again.status, 200); // kein 201 - keine neue Zeile

  const after = await api(`/api/links?type=aufgabe&id=${taskId}`);
  assert.equal(after.body.length, 1);
});

test("POST /api/links: Selbstverknüpfung wird abgelehnt", async () => {
  const res = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "aufgabe", a_id: taskId, b_type: "aufgabe", b_id: taskId }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/links: unbekannter Objekttyp wird abgelehnt", async () => {
  const res = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "aufgabe", a_id: taskId, b_type: "termin", b_id: 1 }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/links: nicht existierendes Ziel-Objekt wird abgelehnt", async () => {
  const res = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "aufgabe", a_id: taskId, b_type: "vertrag", b_id: 999999 }),
  });
  assert.equal(res.status, 404);
});

test("GET /api/links: ungültiger Typ/fehlende ID wird abgelehnt statt eine leere Liste zu liefern", async () => {
  const badType = await api("/api/links?type=termin&id=1");
  assert.equal(badType.status, 400);

  const missingId = await api(`/api/links?type=aufgabe`);
  assert.equal(missingId.status, 400);
});

test("DELETE /api/links/:id entfernt die Verknüpfung, ein zweites Mal liefert 404", async () => {
  const created = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "aufgabe", a_id: taskId, b_type: "vertrag", b_id: contractId }),
  });
  const linkId = created.body.id;

  const deleted = await api(`/api/links/${linkId}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);

  const list = await api(`/api/links?type=aufgabe&id=${taskId}`);
  assert.equal(list.body.length, 0);

  const again = await api(`/api/links/${linkId}`, { method: "DELETE" });
  assert.equal(again.status, 404);
});

test("GET /api/links: ein inzwischen gelöschtes verlinktes Objekt taucht nicht mehr als Chip auf", async () => {
  const scratchTask = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Wird gleich gelöscht" }) });
  const link = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "vertrag", a_id: contractId, b_type: "aufgabe", b_id: scratchTask.body.id }),
  });
  assert.equal(link.status, 201);

  await api(`/api/tasks/${scratchTask.body.id}`, { method: "DELETE" });

  const list = await api(`/api/links?type=vertrag&id=${contractId}`);
  assert.ok(!list.body.some((l) => l.type === "aufgabe" && l.id === scratchTask.body.id));
});
