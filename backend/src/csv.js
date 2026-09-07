// Kleiner, abhängigkeitsfreier CSV-Helfer für den deutschen Excel-Dialekt
// (Semikolon als Trenner, da Euro-Beträge das Komma als Dezimaltrennzeichen
// nutzen und dadurch nicht mit einem Komma-Trenner kollidieren).

const DELIMITER = ";";
// Zeichen, mit denen Excel/Sheets/LibreOffice einen Zellwert als Formel
// statt als Text interpretieren (CSV-/Formel-Injection). Werte aus
// Rechnungs-Scans (routes/invoices.js) stammen letztlich aus E-Mail-Betreff
// und PDF-Text - also aus nicht vertrauenswürdiger externer Quelle, die
// beim Export in eine Tabellenkalkulation ausführbar werden könnte
// ("=cmd|'/c calc'!A1" ist ein bekanntes Beispiel).
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

export function csvEscape(value) {
  let str = value === null || value === undefined ? "" : String(value);
  if (FORMULA_PREFIX_PATTERN.test(str)) {
    // Führendes Apostroph: Tabellenkalkulationen zeigen den Zellinhalt
    // dann als reinen Text an, statt ihn als Formel auszuwerten.
    str = `'${str}`;
  }
  if (str.includes(DELIMITER) || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(DELIMITER)];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(DELIMITER));
  }
  return lines.join("\r\n");
}

// Parst CSV-Text (Semikolon-getrennt, Anführungszeichen mit "" escaped) in
// ein Array von Zeilen (jede Zeile: Array von Feldern als String). Wirft
// einen Error, wenn die Datei mit einem offenen Anführungszeichen endet -
// ohne diese Prüfung würde alles nach dem fehlenden schließenden Zeichen
// (potenziell der komplette Rest der Datei inkl. weiterer Zeilen) still zu
// einem einzigen Feld verschluckt, statt einen erkennbaren Fehler zu geben.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let quoteStartLine = 0;
  let currentLine = 1;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") currentLine++;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      quoteStartLine = currentLine;
    } else if (char === DELIMITER) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      currentLine++;
    } else {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error(`Nicht geschlossenes Anführungszeichen ab Zeile ${quoteStartLine}.`);
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
