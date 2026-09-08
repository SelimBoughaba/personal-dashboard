// Deckt den Papierkorb ab (routes/trash.js, trash.js, Punkt 77): "Löschen"
// auf den acht TRASH_TABLES setzt nur noch deleted_at statt die Zeile
// wirklich zu entfernen, wiederherstellbar innerhalb der Aufbewahrungsfrist
// (TRASH_RETENTION_DAYS). Ein trashten Objekt darf nirgendwo sonst mehr
// auftauchen (Listen, Suche, Verknüpfungs-Chips), bis es wiederhergestellt
// wird. Bei Dokumenten bleibt die Datei bis zum endgültigen Löschen/Ablauf
// der Frist auf der Platte liegen.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-trash-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;

const { app } = await import("../src/index.js");
const { db } = await import("../src/db.js");

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

test("DELETE /api/tasks/:id: Aufgabe verschwindet aus der Liste, taucht im Papierkorb auf", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Papierkorb-Testaufgabe" }) });
  const del = await api(`/api/tasks/${created.body.id}`, { method: "DELETE" });
  assert.equal(del.status, 204);

  const list = await api("/api/tasks");
  assert.ok(!list.body.some((t) => t.id === created.body.id));

  const trash = await api("/api/trash");
  assert.equal(trash.body.retentionDays, 30);
  const entry = trash.body.items.find((i) => i.type === "aufgabe" && i.id === created.body.id);
  assert.ok(entry, "Aufgabe muss im Papierkorb auftauchen");
  assert.equal(entry.title, "Papierkorb-Testaufgabe");
  assert.ok(entry.deletedAt);
  assert.ok(entry.purgeAt > entry.deletedAt);
});

test("Eine im Papierkorb liegende Aufgabe lässt sich nicht mehr per PATCH ändern (404, wie gelöscht)", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Wird getrasht" }) });
  await api(`/api/tasks/${created.body.id}`, { method: "DELETE" });

  const patch = await api(`/api/tasks/${created.body.id}`, { method: "PATCH", body: JSON.stringify({ title: "Neu" }) });
  assert.equal(patch.status, 404);
});

test("POST /api/trash/aufgabe/:id/restore stellt die Aufgabe wieder her", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Wird wiederhergestellt" }) });
  await api(`/api/tasks/${created.body.id}`, { method: "DELETE" });

  const restore = await api(`/api/trash/aufgabe/${created.body.id}/restore`, { method: "POST" });
  assert.equal(restore.status, 200);

  const list = await api("/api/tasks");
  assert.ok(list.body.some((t) => t.id === created.body.id));

  const trash = await api("/api/trash");
  assert.ok(!trash.body.items.some((i) => i.type === "aufgabe" && i.id === created.body.id));
});

test("POST .../restore für ein nicht im Papierkorb liegendes Objekt liefert 404", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Nie gelöscht" }) });
  const restore = await api(`/api/trash/aufgabe/${created.body.id}/restore`, { method: "POST" });
  assert.equal(restore.status, 404);
});

test("POST .../restore mit ungültigem Objekttyp liefert 400", async () => {
  const restore = await api("/api/trash/nicht-existent/1/restore", { method: "POST" });
  assert.equal(restore.status, 400);
});

test("DELETE /api/trash/aufgabe/:id löscht endgültig - danach weder in der Liste noch im Papierkorb, zweiter Versuch 404", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Wird endgültig gelöscht" }) });
  await api(`/api/tasks/${created.body.id}`, { method: "DELETE" });

  const purge = await api(`/api/trash/aufgabe/${created.body.id}`, { method: "DELETE" });
  assert.equal(purge.status, 204);

  const trash = await api("/api/trash");
  assert.ok(!trash.body.items.some((i) => i.type === "aufgabe" && i.id === created.body.id));

  const restore = await api(`/api/trash/aufgabe/${created.body.id}/restore`, { method: "POST" });
  assert.equal(restore.status, 404, "endgültig gelöscht - auch kein Wiederherstellen mehr möglich");

  const purgeAgain = await api(`/api/trash/aufgabe/${created.body.id}`, { method: "DELETE" });
  assert.equal(purgeAgain.status, 404);
});

test("Ein getrashtes Objekt taucht nicht mehr in der Suche auf, nach Wiederherstellung wieder", async () => {
  const created = await api("/api/notes", { method: "POST", body: JSON.stringify({ title: "Einzigartiger Papierkorb-Suchbegriff" }) });
  let search = await api("/api/search?q=Einzigartiger");
  assert.ok(search.body.some((r) => r.type === "notiz" && r.id === created.body.id));

  await api(`/api/notes/${created.body.id}`, { method: "DELETE" });
  search = await api("/api/search?q=Einzigartiger");
  assert.ok(!search.body.some((r) => r.type === "notiz" && r.id === created.body.id));

  await api(`/api/trash/notiz/${created.body.id}/restore`, { method: "POST" });
  search = await api("/api/search?q=Einzigartiger");
  assert.ok(search.body.some((r) => r.type === "notiz" && r.id === created.body.id));
});

test("Ein getrashtes Objekt kann nicht neu verlinkt werden (existsById schlägt fehl)", async () => {
  const task = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Link-Ziel" }) });
  const contract = await api("/api/contracts", { method: "POST", body: JSON.stringify({ title: "Link-Quelle" }) });
  await api(`/api/tasks/${task.body.id}`, { method: "DELETE" });

  const link = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "vertrag", a_id: contract.body.id, b_type: "aufgabe", b_id: task.body.id }),
  });
  assert.equal(link.status, 404);
});

test("Dokument: Soft-Delete lässt die Datei auf der Platte, endgültiges Löschen entfernt sie", async () => {
  const form = new FormData();
  form.append("file", new Blob(["Testinhalt"], { type: "text/plain" }), "test.txt");
  form.append("title", "Papierkorb-Testdokument");

  const uploadRes = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const doc = await uploadRes.json();
  assert.equal(uploadRes.status, 201);

  const storedRow = db.prepare("SELECT stored_name FROM documents WHERE id = ?").get(doc.id);
  const documentsDir = path.dirname(
    (await import("../src/documentStorage.js")).resolveStoredDocumentPath(storedRow.stored_name),
  );
  const filePath = path.join(documentsDir, storedRow.stored_name);
  assert.ok(fs.existsSync(filePath), "Datei muss nach Upload existieren");

  await api(`/api/documents/${doc.id}`, { method: "DELETE" });
  assert.ok(fs.existsSync(filePath), "Datei muss nach Soft-Delete weiter existieren (Papierkorb)");

  const download = await api(`/api/documents/${doc.id}/download`);
  assert.equal(download.status, 404, "Download eines getrashten Dokuments muss 404 liefern");

  const purge = await api(`/api/trash/dokument/${doc.id}`, { method: "DELETE" });
  assert.equal(purge.status, 204);
  assert.ok(!fs.existsSync(filePath), "Datei muss nach endgültigem Löschen entfernt sein");
});

test("purgeExpired entfernt Einträge nach Ablauf der Aufbewahrungsfrist automatisch beim nächsten Abruf", async () => {
  const created = await api("/api/prompts", {
    method: "POST",
    body: JSON.stringify({ title: "Alter Papierkorb-Eintrag", content: "Inhalt" }),
  });
  await api(`/api/prompts/${created.body.id}`, { method: "DELETE" });

  // Aufbewahrungsfrist künstlich überschritten simulieren (echtes Warten von
  // 30 Tagen ist im Test nicht möglich) - direkter DB-Zugriff, nicht über
  // die API, weil die Vergangenheits-Manipulation nur zu Testzwecken ist.
  db.prepare("UPDATE prompts SET deleted_at = datetime('now', '-31 days') WHERE id = ?").run(created.body.id);

  const trash = await api("/api/trash");
  assert.ok(!trash.body.items.some((i) => i.type === "prompt" && i.id === created.body.id));

  // Wirklich aus der Datenbank verschwunden, nicht nur aus der Anzeige gefiltert.
  const row = db.prepare("SELECT id FROM prompts WHERE id = ?").get(created.body.id);
  assert.equal(row, undefined);
});
