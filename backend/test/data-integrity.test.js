// Zweite Testdatei für die Abschnitt-2-Korrekturen (Datenkonsistenz/Backend):
// Bereichsreferenz-Integrität über alle Tabellen, CSV-Robustheit, RRULE-
// Expansionsgrenze, Kalender-Zeitraumvalidierung und die dabei entdeckte
// Regression bei health_entries im Restore. Eigene Datei (eigene isolierte
// Testdatenbank über einen zweiten Temp-Ordner), damit sie unabhängig von
// security.test.js läuft.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-data-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;

const { app } = await import("../src/index.js");
const { parseCsv, csvEscape, toCsv } = await import("../src/csv.js");
const { expandEvent } = await import("../src/caldav.js");

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

// ---------------------------------------------------------------------
// Punkt 14: Bereichsreferenz-Integrität über ALLE Tabellen
// ---------------------------------------------------------------------

test("deleting an area with reassign_to migrates references in every area-owning table, not just tasks/invoices", async () => {
  const area = await api("/api/areas", {
    method: "POST",
    body: JSON.stringify({ id: "wegwerfbereich", label: "Wegwerfbereich" }),
  });
  assert.equal(area.status, 201);

  const target = await api("/api/areas", { method: "POST", body: JSON.stringify({ id: "zielbereich", label: "Zielbereich" }) });
  assert.equal(target.status, 201);

  const doc = await api("/api/notes", {
    method: "POST",
    body: JSON.stringify({ title: "n", content: "c", area: "wegwerfbereich", tags: [] }),
  });
  assert.equal(doc.status, 201);
  const goal = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: "g", area: "wegwerfbereich" }),
  });
  assert.equal(goal.status, 201);
  const contract = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({ title: "v", area: "wegwerfbereich" }),
  });
  assert.equal(contract.status, 201);

  // Ohne reassign_to: 409 mit Zähler pro betroffener Tabelle (nicht nur
  // tasks/invoices, die hier beide 0 sind).
  const blocked = await api("/api/areas/wegwerfbereich", { method: "DELETE", body: JSON.stringify({}) });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.needsReassignment, true);
  assert.equal(blocked.body.counts.notes, 1);
  assert.equal(blocked.body.counts.goals, 1);
  assert.equal(blocked.body.counts.contracts, 1);
  assert.equal(blocked.body.counts.tasks, 0);

  const deleted = await api("/api/areas/wegwerfbereich", {
    method: "DELETE",
    body: JSON.stringify({ reassign_to: "zielbereich" }),
  });
  assert.equal(deleted.status, 204);

  const notes = await api("/api/notes");
  assert.equal(notes.body.find((n) => n.id === doc.body.id).area, "zielbereich");
  const goals = await api("/api/goals");
  assert.equal(goals.body.find((g) => g.id === goal.body.id).area, "zielbereich");
  const contracts = await api("/api/contracts");
  assert.equal(contracts.body.find((c) => c.id === contract.body.id).area, "zielbereich");
});

test("archiving the only active area is rejected", async () => {
  const areas = await api("/api/areas");
  // Alle bis auf einen archivieren, damit garantiert genau ein aktiver übrig bleibt.
  const active = areas.body.filter((a) => !a.archived);
  for (const a of active.slice(1)) {
    const res = await api(`/api/areas/${a.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
    assert.ok(res.status === 200 || res.status === 400); // 400 falls das schon der letzte war
  }
  const stillActive = (await api("/api/areas")).body.filter((a) => !a.archived);
  assert.equal(stillActive.length, 1, "Testvoraussetzung: genau ein aktiver Bereich übrig");

  const res = await api(`/api/areas/${stillActive[0].id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  assert.equal(res.status, 400);

  const after2 = (await api("/api/areas")).body.filter((a) => !a.archived);
  assert.equal(after2.length, 1, "letzter aktiver Bereich darf nicht archiviert worden sein");
});

test("archiving the current default area reassigns the default to another active area", async () => {
  // Reaktivieren, damit wieder mehrere aktive Bereiche existieren.
  const areas = (await api("/api/areas")).body;
  for (const a of areas) {
    await api(`/api/areas/${a.id}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });
  }
  const withDefault = (await api("/api/areas")).body;
  const currentDefault = withDefault.find((a) => a.is_default);
  assert.ok(currentDefault, "Testvoraussetzung: es gibt einen Default-Bereich");

  const res = await api(`/api/areas/${currentDefault.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.is_default, 0, "archivierter Bereich darf nicht mehr Default sein");

  const after2 = (await api("/api/areas")).body;
  const newDefault = after2.find((a) => a.is_default);
  assert.ok(newDefault, "es muss weiterhin genau einen Default-Bereich geben");
  assert.equal(newDefault.archived, 0, "der neue Default-Bereich muss aktiv sein");
  assert.notEqual(newDefault.id, currentDefault.id);
});

test("reorder renumbers areas missing from the submitted list instead of leaving stale sort_order values", async () => {
  const areas = (await api("/api/areas")).body;
  const ids = areas.map((a) => a.id);
  // Absichtlich unvollständige Liste (nur die ersten beiden).
  const partial = ids.slice(0, 2);
  const res = await api("/api/areas/reorder", { method: "POST", body: JSON.stringify({ order: partial }) });
  assert.equal(res.status, 200);

  const sortOrders = res.body.map((a) => a.sort_order).sort((a, b) => a - b);
  const unique = new Set(sortOrders);
  assert.equal(unique.size, sortOrders.length, "sort_order muss über ALLE Bereiche eindeutig bleiben");
  assert.deepEqual(sortOrders, Array.from({ length: sortOrders.length }, (_, i) => i), "muss lückenlos 0..n-1 sein");
});

// ---------------------------------------------------------------------
// Regression: health_entries im Restore (Bug in dieser Serie selbst
// gefunden - health_entries hat kein area-Feld, die generische
// Bereichsreferenz-Prüfung hätte das fälschlich als "Bereich undefined
// nicht definiert" abgelehnt)
// ---------------------------------------------------------------------

test("backup restore with health entries succeeds (health_entries has no area column)", async () => {
  const backup = (await api("/api/backup")).body;
  backup.health_entries = [
    {
      id: 1,
      entry_date: "2026-01-01",
      type: "gewicht",
      value: 80.5,
      unit: "kg",
      note: "",
      created_at: "2026-01-01 00:00:00",
      updated_at: "2026-01-01 00:00:00",
    },
  ];
  const res = await api("/api/backup/restore", { method: "POST", body: JSON.stringify({ data: backup, confirm: true }) });
  assert.equal(res.status, 200);

  const entries = await api("/api/health-entries");
  assert.equal(entries.body.length, 1);
  assert.equal(entries.body[0].type, "gewicht");
});

// ---------------------------------------------------------------------
// Punkt 21: RRULE-Expansionsgrenze
// ---------------------------------------------------------------------

test("expandEvent caps occurrences per event instead of expanding without bound", () => {
  const rangeStart = new Date("2026-01-01T00:00:00Z");
  const rangeEnd = new Date("2030-01-01T00:00:00Z");
  // Ein Fake-RRULE, das viel mehr Termine liefert, als jemals in einem
  // Kalender realistisch nötig wären (simuliert z.B. ein sekündliches RRULE
  // über mehrere Jahre).
  const manyDates = [];
  for (let i = 0; i < 5000; i++) {
    manyDates.push(new Date(rangeStart.getTime() + i * 60 * 60 * 1000));
  }
  const fakeEvent = {
    start: rangeStart,
    end: new Date(rangeStart.getTime() + 30 * 60 * 1000),
    summary: "Viel zu oft",
    rrule: { between: () => manyDates },
  };

  const occurrences = expandEvent(fakeEvent, rangeStart, rangeEnd);
  assert.ok(occurrences.length < manyDates.length, "muss tatsächlich gekappt werden");
  assert.ok(occurrences.length <= 500, "Obergrenze aus caldav.js#MAX_OCCURRENCES_PER_EVENT");
});

// ---------------------------------------------------------------------
// Kalender-Zeitraumvalidierung (Teil von Punkt 22, an der Routen-Grenze)
// ---------------------------------------------------------------------

test("calendar events route rejects an invalid or inverted date range before touching CalDAV", async () => {
  const invalidDate = await api("/api/calendar/events?from=not-a-date&to=2026-01-01");
  assert.equal(invalidDate.status, 400);

  const inverted = await api("/api/calendar/events?from=2026-06-01&to=2026-01-01");
  assert.equal(inverted.status, 400);

  const tooWide = await api(`/api/calendar/events?from=2020-01-01&to=2030-01-01`);
  assert.equal(tooWide.status, 400);

  // Ein gültiger, normaler Zeitraum kommt bis zum eigentlichen CalDAV-Aufruf
  // durch (der dann mit 503 scheitert, weil in diesem Test kein Kalender
  // konfiguriert ist - das ist der Beweis, dass die Validierung selbst
  // nicht fälschlich blockiert).
  const valid = await api("/api/calendar/events?from=2026-01-01&to=2026-01-08");
  assert.equal(valid.status, 503);
});

// ---------------------------------------------------------------------
// Punkt 23: Number.isFinite statt !Number.isNaN
// ---------------------------------------------------------------------

test("invoices reject Infinity as an amount", async () => {
  const res = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ sender_name: "x", amount: "Infinity" }),
  });
  assert.equal(res.status, 400);
});

test("contracts reject Infinity as a cost", async () => {
  const res = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({ title: "x", cost: "Infinity" }),
  });
  assert.equal(res.status, 400);
});

// ---------------------------------------------------------------------
// Punkt 24: Scan-Vorschläge vs. manuell/bestätigt
// ---------------------------------------------------------------------

test("manually created invoices are confirmed by default; confirming an invoice is idempotent", async () => {
  const created = await api("/api/invoices", { method: "POST", body: JSON.stringify({ sender_name: "Manuell" }) });
  assert.equal(created.status, 201);
  assert.equal(created.body.confirmed, 1);
  assert.equal(created.body.source, "manuell");

  const confirmed = await api(`/api/invoices/${created.body.id}`, {
    method: "PATCH",
    body: JSON.stringify({ confirmed: true }),
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.confirmed, 1);
});

// ---------------------------------------------------------------------
// Punkt 25: CSV-Robustheit
// ---------------------------------------------------------------------

test("parseCsv throws a clear error on an unbalanced quote instead of swallowing the rest of the file", () => {
  const broken = 'Absender;Betreff\n"Firma GmbH;Rechnung\nZeile2;Wert2';
  assert.throws(() => parseCsv(broken), /Anführungszeichen/);
});

test("parseCsv still round-trips well-formed quoted fields", () => {
  const csv = toCsv(["A", "B"], [["hello; world", 'with "quotes"']]);
  const rows = parseCsv(csv);
  assert.deepEqual(rows, [
    ["A", "B"],
    ["hello; world", 'with "quotes"'],
  ]);
});

test("csvEscape neutralizes formula-injection prefixes", () => {
  for (const dangerous of ["=cmd|'/c calc'!A1", "+1+1", "-1+1", "@SUM(A1:A9)"]) {
    const escaped = csvEscape(dangerous);
    assert.ok(escaped.startsWith("'"), `"${dangerous}" muss neutralisiert werden, war: ${escaped}`);
  }
  // Normale Werte bleiben unverändert (bzw. nur CSV-quoted, nicht mit
  // führendem Apostroph versehen).
  assert.equal(csvEscape("IONOS GmbH"), "IONOS GmbH");
});

test("CSV import surfaces a 400 with a readable message for an unbalanced quote", async () => {
  const res = await api("/api/invoices/import", {
    method: "POST",
    body: JSON.stringify({ csv: 'Absender;Betreff\n"Firma GmbH;Rechnung' }),
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Anführungszeichen/);
});
