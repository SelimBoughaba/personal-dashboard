// Deckt die für die native macOS-Hülle (Abschnitt 5) hinzugefügten
// Backend-Teile ab: das Instanztoken in /api/health (Punkt 47 - ein
// beliebiger 200er auf dem gewählten Port darf nicht als eigener Server
// gelten) und dass der optionale Eltern-Prozess-Wachhund (Punkt 50) im
// normalen Server-/Testbetrieb ohne Token nicht aktiv wird. Lauf:
// `npm test` in backend/.
//
// Jeder Testfall importiert index.js mit einer eigenen Query-String-
// Cache-Busting-URL, da process.env.DASHBOARD_INSTANCE_TOKEN beim
// Modul-Laden ausgewertet wird (Top-Level-Konstante) und ein normaler
// zweiter `import` desselben Specifiers das bereits geladene, gecachte
// Modul zurückgeben würde statt mit der neuen Umgebungsvariable neu zu
// laden.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-test-"));
process.env.DASHBOARD_DATA_DIR = tmpDir;
process.env.JWT_SECRET = "";

async function withFreshApp(cacheBustKey, fn) {
  const { app } = await import(`../src/index.js?${cacheBustKey}`);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("/api/health hat kein instanceToken, wenn DASHBOARD_INSTANCE_TOKEN nicht gesetzt ist", async () => {
  delete process.env.DASHBOARD_INSTANCE_TOKEN;
  await withFreshApp("variant=no-token", async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal("instanceToken" in body, false);
  });
});

test("/api/health spiegelt DASHBOARD_INSTANCE_TOKEN exakt zurück, wenn gesetzt", async () => {
  process.env.DASHBOARD_INSTANCE_TOKEN = "test-instance-token-abc123";
  await withFreshApp("variant=with-token", async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.instanceToken, "test-instance-token-abc123");
  });
  delete process.env.DASHBOARD_INSTANCE_TOKEN;
});
