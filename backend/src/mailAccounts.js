// Gemeinsame Hilfsfunktionen für Mail-Modul und Rechnungs-Scanner.

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Zeitüberschreitung: ${label}`)), ms)),
  ]);
}

export function parseAreaRules() {
  try {
    return JSON.parse(process.env.MAIL_AREA_RULES || "{}");
  } catch {
    console.warn("MAIL_AREA_RULES ist kein gültiges JSON – ignoriere Bereichs-Zuordnung.");
    return {};
  }
}

// Bereich anhand der Absenderadresse bestimmen: erste Regel, deren
// Suchtext (Domain oder vollständige Adresse) in der Absenderadresse
// enthalten ist, gewinnt.
export function areaForAddress(address, rules) {
  const lower = (address || "").toLowerCase();
  for (const [match, area] of Object.entries(rules)) {
    if (lower.includes(match.toLowerCase())) return area;
  }
  return "allgemein";
}

export function configuredMailAccounts() {
  const accounts = [];
  if (process.env.IONOS_IMAP_HOST && process.env.IONOS_IMAP_USER && process.env.IONOS_IMAP_PASSWORD) {
    accounts.push({
      id: "ionos",
      host: process.env.IONOS_IMAP_HOST,
      port: process.env.IONOS_IMAP_PORT || 993,
      user: process.env.IONOS_IMAP_USER,
      password: process.env.IONOS_IMAP_PASSWORD,
    });
  }
  // Outlook/Microsoft folgt später separat (erfordert OAuth2 statt Passwort-Login).
  return accounts;
}
