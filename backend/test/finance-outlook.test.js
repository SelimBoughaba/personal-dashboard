// Deckt den finanziellen Ausblick ab (Punkt 71, siehe
// backend/src/financeOutlook.js): 30-/90-Tage-Vorschau aus offenen
// Rechnungen und wiederkehrenden Verträgen, mit bezahlt/geplant/unbekannt-
// Trennung, ohne Dubletten zwischen einer Rechnung und ihrem verknüpften
// Vertrag, und ohne einen erfundenen Kontostand.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-finance-outlook-"));
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

function isoDatePlusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

test("keinen Kontostand/keine Liquidität vortäuschen: die Antwort enthält nur Fenster mit Summen/Listen, keine Kontostandsfelder", async () => {
  const res = await api("/api/finance-outlook");
  assert.equal(res.status, 200);
  assert.ok(res.body.windows["30"]);
  assert.ok(res.body.windows["90"]);
  const json = JSON.stringify(res.body).toLowerCase();
  assert.ok(!json.includes("kontostand"));
  assert.ok(!json.includes("liquidit"));
  assert.ok(!json.includes("balance"));
});

test("offene Rechnung mit Betrag innerhalb von 30 Tagen landet in 'geplant' in beiden Fenstern", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Stromrechnung Herbst", amount: 88.5, due_date: isoDatePlusDays(10), status: "offen" }),
  });
  assert.equal(invoice.status, 201);

  const res = (await api("/api/finance-outlook")).body;
  for (const win of ["30", "90"]) {
    const item = res.windows[win].items.find((i) => i.type === "rechnung" && i.id === invoice.body.id);
    assert.ok(item, `muss im ${win}-Tage-Fenster auftauchen`);
    assert.equal(item.bucket, "geplant");
    assert.equal(item.amount, 88.5);
  }
});

test("offene Rechnung außerhalb von 90 Tagen taucht in keinem Fenster auf", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Weit entfernte Rechnung", amount: 20, due_date: isoDatePlusDays(200), status: "offen" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  for (const win of ["30", "90"]) {
    assert.ok(!res.windows[win].items.some((i) => i.type === "rechnung" && i.id === invoice.body.id));
  }
});

test("Rechnung mit Fälligkeit in 60 Tagen erscheint nur im 90-Tage-Fenster, nicht im 30-Tage-Fenster", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Mittelfristige Rechnung", amount: 42, due_date: isoDatePlusDays(60), status: "offen" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  assert.ok(!res.windows["30"].items.some((i) => i.type === "rechnung" && i.id === invoice.body.id));
  assert.ok(res.windows["90"].items.some((i) => i.type === "rechnung" && i.id === invoice.body.id));
});

test("bereits bezahlte Rechnung mit anstehendem Datum landet in 'bezahlt', zählt in plannedTotal nicht mit", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Vorab bezahlte Rechnung", amount: 15, due_date: isoDatePlusDays(5), status: "bezahlt" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  const item = res.windows["30"].items.find((i) => i.type === "rechnung" && i.id === invoice.body.id);
  assert.equal(item.bucket, "bezahlt");
});

test("eine lange zurückliegende bezahlte Rechnung taucht nicht als aktuelle Verpflichtung auf", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Uralte bezahlte Rechnung", amount: 5, due_date: "2015-01-01", status: "bezahlt" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  for (const win of ["30", "90"]) {
    assert.ok(!res.windows[win].items.some((i) => i.type === "rechnung" && i.id === invoice.body.id));
  }
});

test("eine überfällige offene Rechnung bleibt sichtbar (kein Ausschluss nach unten)", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Überfällige Rechnung", amount: 30, due_date: isoDatePlusDays(-15), status: "offen" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  assert.ok(res.windows["30"].items.some((i) => i.type === "rechnung" && i.id === invoice.body.id && i.bucket === "geplant"));
});

test("offene Rechnung ohne Betrag landet in 'unbekannt', zählt nicht in plannedTotal", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Rechnung ohne Betrag", due_date: isoDatePlusDays(3), status: "offen" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  const item = res.windows["30"].items.find((i) => i.type === "rechnung" && i.id === invoice.body.id);
  assert.equal(item.bucket, "unbekannt");
  assert.equal(item.amount, null);
});

test("unbestätigter Scanner-Vorschlag (confirmed:false) wird nicht mitgezählt", async () => {
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Ungeprüfter Scan", amount: 999, due_date: isoDatePlusDays(3), status: "offen", confirmed: false }),
  });

  const res = (await api("/api/finance-outlook")).body;
  for (const win of ["30", "90"]) {
    assert.ok(!res.windows[win].items.some((i) => i.type === "rechnung" && i.id === invoice.body.id));
  }
});

test("aktiver monatlicher Vertrag projiziert eine Fälligkeit ins 30-Tage-Fenster", async () => {
  const contract = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Streaming-Abo",
      billing_cycle: "monatlich",
      cost: 12.99,
      next_renewal_date: isoDatePlusDays(8),
      status: "aktiv",
    }),
  });

  const res = (await api("/api/finance-outlook")).body;
  const item = res.windows["30"].items.find((i) => i.type === "vertrag" && i.id === contract.body.id);
  assert.ok(item);
  assert.equal(item.bucket, "geplant");
  assert.equal(item.amount, 12.99);
});

test("gekündigter Vertrag projiziert keine Fälligkeiten mehr", async () => {
  const contract = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Gekündigtes Abo",
      billing_cycle: "monatlich",
      cost: 9.99,
      next_renewal_date: isoDatePlusDays(5),
      status: "gekuendigt",
    }),
  });

  const res = (await api("/api/finance-outlook")).body;
  for (const win of ["30", "90"]) {
    assert.ok(!res.windows[win].items.some((i) => i.type === "vertrag" && i.id === contract.body.id));
  }
});

test("aktiver Vertrag ohne Kosten landet in 'unbekannt'", async () => {
  const contract = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({ title: "Vertrag ohne Kosten", billing_cycle: "monatlich", next_renewal_date: isoDatePlusDays(5), status: "aktiv" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  const item = res.windows["30"].items.find((i) => i.type === "vertrag" && i.id === contract.body.id);
  assert.ok(item);
  assert.equal(item.bucket, "unbekannt");
});

test("aktiver Vertrag mit Kosten aber ohne Verlängerungsdatum landet in 'unbekannt' und erscheint in beiden Fenstern", async () => {
  const contract = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({ title: "Vertrag ohne Datum", billing_cycle: "monatlich", cost: 25, status: "aktiv" }),
  });

  const res = (await api("/api/finance-outlook")).body;
  for (const win of ["30", "90"]) {
    const item = res.windows[win].items.find((i) => i.type === "vertrag" && i.id === contract.body.id);
    assert.ok(item, `muss im ${win}-Tage-Fenster auftauchen`);
    assert.equal(item.bucket, "unbekannt");
  }
});

test("verknüpfte Rechnung und zugehöriger Vertrag werden nicht doppelt gezählt", async () => {
  const contract = await api("/api/contracts", {
    method: "POST",
    body: JSON.stringify({
      title: "Internetvertrag",
      billing_cycle: "monatlich",
      cost: 40,
      next_renewal_date: isoDatePlusDays(12),
      status: "aktiv",
    }),
  });
  const invoice = await api("/api/invoices", {
    method: "POST",
    body: JSON.stringify({ subject: "Internetrechnung", amount: 40, due_date: isoDatePlusDays(12), status: "offen" }),
  });
  const link = await api("/api/links", {
    method: "POST",
    body: JSON.stringify({ a_type: "vertrag", a_id: contract.body.id, b_type: "rechnung", b_id: invoice.body.id }),
  });
  assert.equal(link.status, 201);

  const res = (await api("/api/finance-outlook")).body;
  const win30 = res.windows["30"];
  const invoiceItem = win30.items.find((i) => i.type === "rechnung" && i.id === invoice.body.id);
  const contractItem = win30.items.find((i) => i.type === "vertrag" && i.id === contract.body.id);
  assert.ok(invoiceItem, "die Rechnung muss weiterhin auftauchen");
  assert.equal(contractItem, undefined, "der Vertrag darf für diesen Zyklus NICHT zusätzlich auftauchen");
});
