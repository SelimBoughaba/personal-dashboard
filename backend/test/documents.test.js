// Deckt den Dokumentarbeitsplatz-Ausbau ab (Punkt 72, ohne OCR - siehe
// routes/documents.js): sichere Inline-Vorschau anhand echter Dateibytes
// (nie des vom Client behaupteten mime_type) und Dateiduplikathinweise
// anhand SHA-256-Hash, rein informativ ohne automatisches Zusammenführen.
//
// Eigene isolierte Testdatenbank, unabhängig von den anderen Testdateien.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-documents-"));
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

async function uploadDocument({ bytes, filename, mimeType, title }) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  if (title) form.append("title", title);
  const res = await fetch(`${baseUrl}/api/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json();
  return { status: res.status, body };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_HEADER = Buffer.from("%PDF-1.4\n%test content for preview sniffing\n");

// Jeder Aufruf liefert eindeutigen Byte-Inhalt (echter PNG-Header + Zufalls-
// Suffix) - verschiedene Tests im selben Lauf teilen sich dieselbe,
// zwischen Tests nicht zurückgesetzte Datenbank, ohne Eindeutigkeit würden
// sich Dubletten-Zuordnungen aus verschiedenen Tests sonst gegenseitig
// verfälschen.
function uniquePngBytes() {
  return Buffer.concat([PNG_MAGIC, crypto.randomBytes(8)]);
}

test("POST /api/documents + GET .../preview: eine echte PNG-Datei liefert eine Inline-Vorschau", async () => {
  const uploaded = await uploadDocument({ bytes: uniquePngBytes(), filename: "bild.png", mimeType: "image/png", title: "Testbild" });
  assert.equal(uploaded.status, 201);

  const res = await fetch(`${baseUrl}/api/documents/${uploaded.body.id}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.match(res.headers.get("content-disposition") || "", /inline/);
});

test("GET .../preview: eine echte PDF-Datei liefert eine Inline-Vorschau", async () => {
  const uploaded = await uploadDocument({ bytes: PDF_HEADER, filename: "dokument.pdf", mimeType: "application/pdf" });
  const res = await fetch(`${baseUrl}/api/documents/${uploaded.body.id}/preview`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
});

test("GET .../preview: ein nicht erkanntes Format liefert 415 statt einer Vorschau", async () => {
  const uploaded = await uploadDocument({ bytes: Buffer.from("Nur Text, kein Bild/PDF."), filename: "text.txt", mimeType: "text/plain" });
  const res = await api(`/api/documents/${uploaded.body.id}/preview`);
  assert.equal(res.status, 415);
});

test("GET .../preview: ein als 'image/png' getarnter Textinhalt wird NICHT als Vorschau ausgeliefert (echte Byte-Prüfung, kein Vertrauen auf den Client-mime_type)", async () => {
  const uploaded = await uploadDocument({
    bytes: Buffer.from("<script>alert(1)</script>"),
    filename: "getarnt.png",
    mimeType: "image/png", // vom Client behauptet, aber falsch
    title: "Getarnte Datei",
  });
  assert.equal(uploaded.status, 201);
  // Die Datenbank speichert weiterhin den (irreführenden) Client-mime_type,
  // aber die Vorschau darf sich davon nicht täuschen lassen.
  assert.equal(uploaded.body.mime_type, "image/png");

  const res = await api(`/api/documents/${uploaded.body.id}/preview`);
  assert.equal(res.status, 415);
});

test("POST /api/documents: eine inhaltsgleiche zweite Datei bekommt einen Dublettenhinweis, die erste bleibt unverändert erhalten", async () => {
  const bytes = uniquePngBytes();
  const first = await uploadDocument({ bytes, filename: "original.png", mimeType: "image/png", title: "Original" });
  assert.equal(first.status, 201);
  assert.equal(first.body.duplicateOf, undefined);

  const second = await uploadDocument({ bytes, filename: "kopie.png", mimeType: "image/png", title: "Kopie" });
  assert.equal(second.status, 201);
  assert.ok(second.body.duplicateOf, "muss einen Dublettenhinweis enthalten");
  assert.equal(second.body.duplicateOf.id, first.body.id);

  // Kein automatisches Zusammenführen/Löschen - beide Dokumente existieren unabhängig weiter.
  const list = await api("/api/documents");
  assert.ok(list.body.some((d) => d.id === first.body.id));
  assert.ok(list.body.some((d) => d.id === second.body.id));
});

test("POST /api/documents: inhaltlich unterschiedliche Dateien bekommen keinen Dublettenhinweis", async () => {
  const a = await uploadDocument({ bytes: uniquePngBytes(), filename: "a.png", mimeType: "image/png" });
  const differentBytes = uniquePngBytes();
  const b = await uploadDocument({ bytes: differentBytes, filename: "b.png", mimeType: "image/png" });
  assert.equal(b.body.duplicateOf, undefined);
  assert.notEqual(a.body.id, b.body.id);
});

test("GET .../preview: nicht existierendes Dokument liefert 404", async () => {
  const res = await api("/api/documents/999999/preview");
  assert.equal(res.status, 404);
});

test("GET .../preview: ein getrashtes Dokument liefert 404 (wie der Download)", async () => {
  const uploaded = await uploadDocument({ bytes: uniquePngBytes(), filename: "wird-geloescht.png", mimeType: "image/png" });
  await api(`/api/documents/${uploaded.body.id}`, { method: "DELETE" });
  const res = await api(`/api/documents/${uploaded.body.id}/preview`);
  assert.equal(res.status, 404);
});
