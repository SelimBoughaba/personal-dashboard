// Deckt die FTS5-Suchindex-Migration ab (Punkt 86, siehe Migration 0025 in
// migrations.js und routes/search.js): Präfix-Treffer, sichere Behandlung
// von FTS5-Sonderzeichen/-Operatoren in der Nutzereingabe, mehrwortige
// UND-Verknüpfung und echte Löschpropagation im Index (nicht nur
// Herausfiltern über deleted_at zur Abfragezeit).
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-search-fts5-"));
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

test("GET /api/search: Präfix-Treffer - ein Teilwort am Wortanfang findet den vollen Begriff", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Steuererklärung einreichen" }) });
  assert.equal(created.status, 201);

  const res = await api("/api/search?q=Steuererkl");
  assert.equal(res.status, 200);
  assert.ok(res.body.some((r) => r.type === "aufgabe" && r.id === created.body.id));
});

test("GET /api/search: mehrere Wörter werden UND-verknüpft - beide Wörter müssen vorkommen", async () => {
  await api("/api/notes", { method: "POST", body: JSON.stringify({ title: "Einkaufsliste", content: "Milch und Brot kaufen" }) });
  const both = await api("/api/notes", { method: "POST", body: JSON.stringify({ title: "Wocheneinkauf", content: "Milch, Käse und Obst" }) });

  const matchesBoth = await api("/api/search?q=Milch%20K%C3%A4se");
  assert.ok(matchesBoth.body.some((r) => r.type === "notiz" && r.id === both.body.id));
  assert.ok(!matchesBoth.body.some((r) => r.type === "notiz" && r.title === "Einkaufsliste"), "darf die Notiz ohne 'Käse' nicht treffen");
});

test("GET /api/search: FTS5-Sonderzeichen/-Operatoren in der Eingabe lösen keinen Serverfehler aus und werden als reiner Text behandelt", async () => {
  const created = await api("/api/notes", { method: "POST", body: JSON.stringify({ title: 'Sonderfall "Test" (2026)', content: "" }) });
  assert.equal(created.status, 201);

  const pathological = [
    'titel:"wert"',
    "AND OR NOT",
    'NEAR("a" "b")',
    'unausgeglichenes " Anführungszeichen',
    "((()))",
    "a* OR b*",
  ];
  for (const q of pathological) {
    const res = await api(`/api/search?${new URLSearchParams({ q })}`);
    assert.equal(res.status, 200, `Anfrage "${q}" darf keinen Serverfehler auslösen`);
    assert.ok(Array.isArray(res.body));
  }

  // Der literale Text der angelegten Notiz muss trotz enthaltener
  // Anführungszeichen/Klammern weiterhin normal auffindbar sein.
  const found = await api("/api/search?q=Sonderfall");
  assert.ok(found.body.some((r) => r.type === "notiz" && r.id === created.body.id));
});

test("GET /api/search: leere/reine Leerzeichen-Anfrage liefert eine leere Liste ohne Fehler", async () => {
  const empty = await api("/api/search?q=");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, []);

  const spaces = await api(`/api/search?${new URLSearchParams({ q: "   " })}`);
  assert.equal(spaces.status, 200);
  assert.deepEqual(spaces.body, []);
});

test("Echte Löschpropagation: endgültiges Löschen entfernt die Zeile tatsächlich aus dem FTS-Index (nicht nur aus der Suchantwort)", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Wird endgültig entfernt XYZ" }) });
  const id = created.body.id;

  const inIndexBefore = db.prepare("SELECT count(*) AS c FROM tasks_fts WHERE rowid = ?").get(id);
  assert.equal(inIndexBefore.c, 1, "muss direkt nach dem Anlegen im Index stehen");

  await api(`/api/tasks/${id}`, { method: "DELETE" }); // Soft-Delete (Papierkorb)
  await api(`/api/trash/aufgabe/${id}`, { method: "DELETE" }); // endgültiges Löschen

  const inIndexAfter = db.prepare("SELECT count(*) AS c FROM tasks_fts WHERE rowid = ?").get(id);
  assert.equal(inIndexAfter.c, 0, "muss nach endgültigem Löschen auch aus dem FTS-Index entfernt sein");
});

test("Backup-Wiederherstellung hält den FTS-Index synchron (Trigger feuern auch bei den Bulk-Inserts in routes/backup.js)", async () => {
  const original = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Vor dem Backup ABCDEF" }) });
  const exported = await fetch(`${baseUrl}/api/backup`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());

  // Nach dem Export eine andere Aufgabe anlegen, die NICHT im Backup steckt -
  // nach der Wiederherstellung darf sie weder in der Tabelle noch im Index auftauchen.
  const afterExport = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Nach dem Backup GHIJKL" }) });

  const restore = await api("/api/backup/restore", { method: "POST", body: JSON.stringify({ data: exported, confirm: true }) });
  assert.equal(restore.status, 200);

  const findsOriginal = await api("/api/search?q=ABCDEF");
  assert.ok(findsOriginal.body.some((r) => r.type === "aufgabe" && r.id === original.body.id), "die wiederhergestellte Aufgabe muss durchsuchbar sein");

  const findsRemoved = await api("/api/search?q=GHIJKL");
  assert.ok(!findsRemoved.body.some((r) => r.type === "aufgabe"), "die nach dem Export angelegte, nicht im Backup enthaltene Aufgabe darf nicht mehr auftauchen");

  const staleIndexRow = db.prepare("SELECT count(*) AS c FROM tasks_fts WHERE rowid = ?").get(afterExport.body.id);
  assert.equal(staleIndexRow.c, 0, "der FTS-Index darf keine Leiche für die zurückgesetzte Zeile behalten");
});

test("Inkrementelle Pflege: eine Titeländerung ist sofort durchsuchbar, der alte Titel nicht mehr", async () => {
  const created = await api("/api/tasks", { method: "POST", body: JSON.stringify({ title: "Ursprungstitel Alpha" }) });
  const id = created.body.id;

  const beforeRename = await api("/api/search?q=Alpha");
  assert.ok(beforeRename.body.some((r) => r.type === "aufgabe" && r.id === id));

  await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ title: "Neuer Titel Beta" }) });

  const afterRenameOld = await api("/api/search?q=Alpha");
  assert.ok(!afterRenameOld.body.some((r) => r.type === "aufgabe" && r.id === id), "alter Titel darf nicht mehr treffen");

  const afterRenameNew = await api("/api/search?q=Beta");
  assert.ok(afterRenameNew.body.some((r) => r.type === "aufgabe" && r.id === id), "neuer Titel muss sofort treffen");
});
