// Kleiner, abhängigkeitsfreier CSV-Helfer für den deutschen Excel-Dialekt
// (Semikolon als Trenner, da Euro-Beträge das Komma als Dezimaltrennzeichen
// nutzen und dadurch nicht mit einem Komma-Trenner kollidieren).

const DELIMITER = ";";

export function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
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
// ein Array von Zeilen (jede Zeile: Array von Feldern als String).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
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
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === DELIMITER) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
