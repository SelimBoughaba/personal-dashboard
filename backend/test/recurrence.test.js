// Reine Unit-Tests für die Datumsarithmetik wiederkehrender Aufgaben
// (src/recurrence.js, Punkt 66) - kein Server nötig. Deckt genau die im
// Prompt geforderten Randfälle ab: Sommerzeit, Monatsende, verpasste
// Vorkommen, "nur werktags" und Serienende.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNextOccurrence, nextOccurrenceAfterGap, planNextOccurrence } from "../src/recurrence.js";

test("computeNextOccurrence: täglich/wöchentlich/monatlich mit Intervall", () => {
  assert.equal(computeNextOccurrence("2026-03-10", { freq: "daily", interval: 1 }), "2026-03-11");
  assert.equal(computeNextOccurrence("2026-03-10", { freq: "daily", interval: 3 }), "2026-03-13");
  assert.equal(computeNextOccurrence("2026-03-10", { freq: "weekly", interval: 1 }), "2026-03-17");
  assert.equal(computeNextOccurrence("2026-03-10", { freq: "weekly", interval: 2 }), "2026-03-24");
  assert.equal(computeNextOccurrence("2026-03-10", { freq: "monthly", interval: 1 }), "2026-04-10");
});

test("computeNextOccurrence: Monatsende wird auf die tatsächliche Monatslänge begrenzt", () => {
  // 31. Januar + 1 Monat ist der 28. Februar 2026 (kein Schaltjahr) - nicht
  // der 3. März, den JS' naives setMonth ohne Begrenzung liefern würde.
  assert.equal(computeNextOccurrence("2026-01-31", { freq: "monthly", interval: 1 }), "2026-02-28");
  // 2028 ist ein Schaltjahr.
  assert.equal(computeNextOccurrence("2028-01-31", { freq: "monthly", interval: 1 }), "2028-02-29");
  // 31. März + 1 Monat -> 30. April (April hat nur 30 Tage).
  assert.equal(computeNextOccurrence("2026-03-31", { freq: "monthly", interval: 1 }), "2026-04-30");
});

test("computeNextOccurrence: 'nur werktags' überspringt Wochenenden", () => {
  // 2026-03-13 ist ein Freitag. +1 Tag wäre Samstag -> rutscht auf Montag.
  assert.equal(
    computeNextOccurrence("2026-03-13", { freq: "daily", interval: 1, weekdaysOnly: true }),
    "2026-03-16",
  );
  // Ein Dienstag +1 Tag ist ein gewöhnlicher Werktag, keine Verschiebung nötig.
  assert.equal(
    computeNextOccurrence("2026-03-10", { freq: "daily", interval: 1, weekdaysOnly: true }),
    "2026-03-11",
  );
});

test("computeNextOccurrence: Sommerzeit-Umstellung ändert die Tageszählung nicht", () => {
  // In Deutschland 2026: Umstellung auf Sommerzeit am 29.3., auf Winterzeit
  // am 25.10. Rein komponentenbasierte Arithmetik (siehe Kommentar in
  // recurrence.js) darf davon nicht beeinflusst werden - ein mit
  // Millisekunden-Offsets rechnender Ansatz würde an genau diesen Tagen
  // ein falsches Datum liefern.
  assert.equal(computeNextOccurrence("2026-03-28", { freq: "daily", interval: 1 }), "2026-03-29");
  assert.equal(computeNextOccurrence("2026-03-29", { freq: "daily", interval: 1 }), "2026-03-30");
  assert.equal(computeNextOccurrence("2026-10-24", { freq: "daily", interval: 1 }), "2026-10-25");
  assert.equal(computeNextOccurrence("2026-10-25", { freq: "daily", interval: 1 }), "2026-10-26");
  assert.equal(computeNextOccurrence("2026-03-22", { freq: "weekly", interval: 1 }), "2026-03-29");
});

test("nextOccurrenceAfterGap: springt direkt zum nächsten zukünftigen Termin, erzeugt keine Serie von Zwischenschritten", () => {
  // Ein täglicher Termin, der seit 10 Tagen fällig war, soll nur EINEN
  // nächsten Termin liefern (heute oder morgen), nicht zehn.
  const { next, skipped } = nextOccurrenceAfterGap("2026-03-01", { freq: "daily", interval: 1 }, "2026-03-11");
  assert.equal(next, "2026-03-11");
  assert.equal(skipped, 9); // 03-02 bis 03-10 übersprungen, 03-11 ist der erste Treffer >= heute
});

test("nextOccurrenceAfterGap: kein Rückstand, wenn das nächste Vorkommen schon in der Zukunft liegt", () => {
  const { next, skipped } = nextOccurrenceAfterGap("2026-03-10", { freq: "weekly", interval: 1 }, "2026-03-11");
  assert.equal(next, "2026-03-17");
  assert.equal(skipped, 0);
});

test("planNextOccurrence: Modus 'nach_abschluss' rechnet ab dem heutigen Datum, nicht ab dem alten Fälligkeitsdatum", () => {
  // Aufgabe war für den 1.3. fällig, wird aber erst am 20.3. erledigt -
  // "nach Abschluss" heißt: die nächste Aufgabe ist 3 Tage NACH der
  // tatsächlichen Erledigung fällig, nicht 3 Tage nach dem alten Datum.
  const plan = planNextOccurrence({
    recurrence: { freq: "daily", interval: 3, mode: "nach_abschluss" },
    dueDate: "2026-03-01",
    todayIso: "2026-03-20",
  });
  assert.equal(plan.dueDate, "2026-03-23");
  assert.equal(plan.skippedCount, 0); // kann per Definition keinen Rückstand haben
});

test("planNextOccurrence: Modus 'fest' rechnet ab dem ursprünglichen Fälligkeitsdatum mit Rückstands-Deckelung", () => {
  const plan = planNextOccurrence({
    recurrence: { freq: "daily", interval: 1, mode: "fest" },
    dueDate: "2026-03-01",
    todayIso: "2026-03-20",
  });
  assert.equal(plan.dueDate, "2026-03-20");
  assert.equal(plan.skippedCount, 18);
});

test("planNextOccurrence: Enddatum der Serie beendet die Wiederholung", () => {
  const plan = planNextOccurrence({
    recurrence: { freq: "daily", interval: 1, mode: "fest", until: "2026-03-15" },
    dueDate: "2026-03-14",
    todayIso: "2026-03-14",
  });
  assert.equal(plan.dueDate, "2026-03-15"); // letztes gültiges Vorkommen genau am Enddatum

  const ended = planNextOccurrence({
    recurrence: { freq: "daily", interval: 1, mode: "fest", until: "2026-03-15" },
    dueDate: "2026-03-15",
    todayIso: "2026-03-15",
  });
  assert.equal(ended, null); // ein weiteres Vorkommen läge nach dem Enddatum
});
