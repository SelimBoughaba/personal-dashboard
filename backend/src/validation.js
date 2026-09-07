import { z } from "zod";

// Wandelt ein Zod-Schema plus Request-Body in dieselbe {data, errors}-Form
// um, die alle Routen bisher von handgeschriebenen, pro Feld manuell
// geprüften validateXInput()-Funktionen erwartet haben. Route-Handler
// bleiben dadurch unverändert (dieselbe Aufrufform, dieselbe
// Fehlerantwort `{ error: errors.join(" ") }`), nur die eigentliche
// Prüfung wird durch ein deklaratives, wiederverwendbares Schema ersetzt.
//
// partial=true nutzt Zods eingebautes .partial(): fehlende Felder werden
// nicht verlangt (wie bei PATCH gewünscht), ein trotzdem übergebenes Feld
// wird aber weiterhin genauso streng geprüft wie bei einem vollständigen
// POST - kein manuelles "if (body.x !== undefined)" pro Feld mehr nötig.
export function validateWithSchema(schema, body, { partial = false } = {}) {
  const activeSchema = partial ? schema.partial() : schema;
  const result = activeSchema.safeParse(body ?? {});
  if (result.success) {
    return { data: result.data, errors: [] };
  }
  // Eine Fehlermeldung pro Zod-Issue, in derselben Reihenfolge wie bisher
  // (Titel zuerst etc.), doppelte Meldungen (z. B. durch mehrere
  // Prüfungen auf demselben Feld) werden nicht dedupliziert - entspricht
  // dem bisherigen Verhalten der Routen, die ebenfalls einfach jede
  // gefundene Fehlermeldung anhängten.
  const errors = result.error.issues.map((issue) => issue.message);
  return { data: {}, errors };
}

// Gemeinsame Bausteine, die in mehreren Entitäten mit identischer
// Bedeutung vorkommen.
//
// Wichtig: .optional() allein reicht bei einem NICHT-partial geparsten
// Schema nicht aus, um .transform() bei einem fehlenden Feld zu
// überspringen - Zod ruft die Transform-Funktion trotzdem mit v=undefined
// auf (nur .partial() auf dem GESAMTEN Schema überspringt sie wirklich).
// Jede Transform-Funktion hier prüft daher selbst explizit auf undefined
// und reicht es unverändert durch, statt versehentlich einen Wert für ein
// nie übergebenes Feld zu erzeugen.
export const optionalNullableDateString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

export const optionalTextDefaultEmpty = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v ?? ""));
