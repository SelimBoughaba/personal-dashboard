// Gemeinsame Hilfsfunktionen für Mail-Modul und Rechnungs-Scanner.

import { getDefaultAreaId } from "./db.js";
import { getMailAccounts, getMailAreaRules } from "./configStore.js";

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Zeitüberschreitung: ${label}`)), ms)),
  ]);
}

export function parseAreaRules() {
  return getMailAreaRules();
}

// Bereich anhand der Absenderadresse bestimmen: erste Regel, deren
// Suchtext (Domain oder vollständige Adresse) in der Absenderadresse
// enthalten ist, gewinnt.
export function areaForAddress(address, rules) {
  const lower = (address || "").toLowerCase();
  for (const [match, area] of Object.entries(rules)) {
    if (lower.includes(match.toLowerCase())) return area;
  }
  return getDefaultAreaId();
}

export function configuredMailAccounts() {
  return getMailAccounts().filter((account) => !account.paused);
}
