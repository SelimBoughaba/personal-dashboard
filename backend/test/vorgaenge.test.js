// Deckt die neue Vorgang-Entität ab (Punkt 69, voller Umfang, siehe
// routes/vorgaenge.js): CRUD, Einbindung in den Papierkorb (TRASH_TABLES),
// die Suche (routes/search.js) und die Kontextlinks (routes/links.js) - ein
// Vorgang ist bewusst nur ein weiterer verlinkbarer Objekttyp, kein eigenes
// Beziehungsmodell.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-vorgaenge-"));
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

test("POST /api/vorgaenge: legt einen Vorgang mit Defaults an, GET liefert ihn", async () => {
  const created = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Umzug Büro" }) });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, "Umzug Büro");
  assert.equal(created.body.status, "aktiv");
  assert.equal(created.body.description, "");

  const list = await api("/api/vorgaenge");
  assert.equal(list.status, 200);
  assert.ok(list.body.some((v) => v.id === created.body.id));
});

test("POST /api/vorgaenge: leerer Titel wird abgelehnt", async () => {
  const res = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "  " }) });
  assert.equal(res.status, 400);
});

test("POST /api/vorgaenge: ungültiger Status wird abgelehnt", async () => {
  const res = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Test", status: "erledigt" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/vorgaenge/:id: aktualisiert teilweise, GET/Filter nach Status spiegeln die Änderung", async () => {
  const created = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Serverumzug" }) });
  const id = created.body.id;

  const updated = await api(`/api/vorgaenge/${id}`, { method: "PATCH", body: JSON.stringify({ status: "abgeschlossen" }) });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, "abgeschlossen");
  assert.equal(updated.body.title, "Serverumzug"); // unverändert

  const filtered = await api("/api/vorgaenge?status=abgeschlossen");
  assert.ok(filtered.body.some((v) => v.id === id));
  const filteredOut = await api("/api/vorgaenge?status=aktiv");
  assert.ok(!filteredOut.body.some((v) => v.id === id));
});

test("PATCH /api/vorgaenge/:id: nicht existierender Vorgang liefert 404", async () => {
  const res = await api("/api/vorgaenge/999999", { method: "PATCH", body: JSON.stringify({ title: "x" }) });
  assert.equal(res.status, 404);
});

test("DELETE /api/vorgaenge/:id: Soft-Delete - verschwindet aus der Liste, taucht im Papierkorb auf, ist wiederherstellbar", async () => {
  const created = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Zu löschender Vorgang" }) });
  const id = created.body.id;

  const deleted = await api(`/api/vorgaenge/${id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);

  const list = await api("/api/vorgaenge");
  assert.ok(!list.body.some((v) => v.id === id));

  const trash = await api("/api/trash");
  const trashed = trash.body.items.find((i) => i.type === "vorgang" && i.id === id);
  assert.ok(trashed, "gelöschter Vorgang muss im Papierkorb erscheinen");
  assert.equal(trashed.title, "Zu löschender Vorgang");

  const restored = await api(`/api/trash/vorgang/${id}/restore`, { method: "POST" });
  assert.equal(restored.status, 200);

  const listAfter = await api("/api/vorgaenge");
  assert.ok(listAfter.body.some((v) => v.id === id));
});

test("DELETE /api/vorgaenge/:id: zweiter Löschversuch liefert 404", async () => {
  const created = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Einmal löschbar" }) });
  const id = created.body.id;

  const first = await api(`/api/vorgaenge/${id}`, { method: "DELETE" });
  assert.equal(first.status, 204);
  const second = await api(`/api/vorgaenge/${id}`, { method: "DELETE" });
  assert.equal(second.status, 404);
});

test("GET /api/search: findet einen Vorgang über Titel und Beschreibung", async () => {
  await api("/api/vorgaenge", {
    method: "POST",
    body: JSON.stringify({ title: "Steuererklärung 2025", description: "Belege sammeln und einreichen" }),
  });

  const byTitle = await api("/api/search?q=Steuererkl%C3%A4rung");
  assert.ok(byTitle.body.some((r) => r.type === "vorgang" && r.title === "Steuererklärung 2025"));

  const byDescription = await api("/api/search?q=Belege%20sammeln");
  assert.ok(byDescription.body.some((r) => r.type === "vorgang" && r.title === "Steuererklärung 2025"));
});

test("GET /api/search: ein getrashter Vorgang taucht nicht mehr auf, nach Wiederherstellung wieder", async () => {
  const created = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Suchbarer Vorgang XYZ" }) });
  const id = created.body.id;

  const before = await api("/api/search?q=Suchbarer%20Vorgang%20XYZ");
  assert.ok(before.body.some((r) => r.type === "vorgang" && r.id === id));

  await api(`/api/vorgaenge/${id}`, { method: "DELETE" });
  const duringTrash = await api("/api/search?q=Suchbarer%20Vorgang%20XYZ");
  assert.ok(!duringTrash.body.some((r) => r.type === "vorgang" && r.id === id));

  await api(`/api/trash/vorgang/${id}/restore`, { method: "POST" });
  const after = await api("/api/search?q=Suchbarer%20Vorgang%20XYZ");
  assert.ok(after.body.some((r) => r.type === "vorgang" && r.id === id));
});

test("Kontextlinks (Punkt 69, Bündelung): ein Vorgang lässt sich mit Aufgaben/Verträgen verknüpfen und wieder trennen", async () => {
  const vorgang = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Jahresabschluss" }) });
  const task = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Belege sortieren" }) });
  const contract = await api("/api/contracts", { method: "POST", body: JSON.stringify({ title: "Steuerberatervertrag" }) });

  const linkTask = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "vorgang", a_id: vorgang.body.id, b_type: "aufgabe", b_id: task.body.id }),
  });
  assert.equal(linkTask.status, 201);

  const linkContract = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "vorgang", a_id: vorgang.body.id, b_type: "vertrag", b_id: contract.body.id }),
  });
  assert.equal(linkContract.status, 201);

  const fromVorgang = await api(`/api/links?type=vorgang&id=${vorgang.body.id}`);
  assert.equal(fromVorgang.body.length, 2);
  assert.ok(fromVorgang.body.some((l) => l.type === "aufgabe" && l.id === task.body.id));
  assert.ok(fromVorgang.body.some((l) => l.type === "vertrag" && l.id === contract.body.id));

  const fromTask = await api(`/api/links?type=aufgabe&id=${task.body.id}`);
  assert.equal(fromTask.body.length, 1);
  assert.equal(fromTask.body[0].type, "vorgang");
  assert.equal(fromTask.body[0].title, "Jahresabschluss");

  const removed = await api(`/api/links/${linkTask.body.id}`, { method: "DELETE" });
  assert.equal(removed.status, 204);
  const fromVorgangAfter = await api(`/api/links?type=vorgang&id=${vorgang.body.id}`);
  assert.equal(fromVorgangAfter.body.length, 1);
});

test("Ein gelöschter Vorgang taucht nicht mehr als Kontextlink-Chip beim verknüpften Objekt auf", async () => {
  const vorgang = await api("/api/vorgaenge", { method: "POST", body: JSON.stringify({ title: "Wird gleich gelöscht" }) });
  const task = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Referenz-Aufgabe" }) });

  await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "aufgabe", a_id: task.body.id, b_type: "vorgang", b_id: vorgang.body.id }),
  });

  await api(`/api/vorgaenge/${vorgang.body.id}`, { method: "DELETE" });

  const list = await api(`/api/links?type=aufgabe&id=${task.body.id}`);
  assert.ok(!list.body.some((l) => l.type === "vorgang" && l.id === vorgang.body.id));
});
