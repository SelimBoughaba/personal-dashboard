import { test } from "node:test";
import assert from "node:assert/strict";
import { localIsoDate } from "../src/utils/date.js";

test("localIsoDate formats using local getters, not UTC", () => {
  // 2. Januar, 00:30 Uhr Lokalzeit. Ein UTC-basiertes toISOString() würde
  // hier je nach UTC-Offset noch den 1. Januar liefern (das genau ist der
  // Fehler, den localIsoDate behebt) - unabhängig von der Zeitzone des
  // Testrunners muss localIsoDate() aber IMMER den lokalen Kalendertag
  // liefern, den die lokalen Getter auch tatsächlich zurückgeben.
  const d = new Date(2026, 0, 2, 0, 30, 0);
  assert.equal(localIsoDate(d), "2026-01-02");
});

test("localIsoDate pads single-digit month and day", () => {
  const d = new Date(2026, 2, 5, 12, 0, 0);
  assert.equal(localIsoDate(d), "2026-03-05");
});

test("localIsoDate defaults to the current local date when called without an argument", () => {
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(localIsoDate(), expected);
});

test("localIsoDate handles December 31st / year boundary", () => {
  const d = new Date(2025, 11, 31, 23, 59, 0);
  assert.equal(localIsoDate(d), "2025-12-31");
});
