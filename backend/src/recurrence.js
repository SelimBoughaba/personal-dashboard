// Datumsarithmetik für wiederkehrende Aufgaben (Punkt 66 der Design-
// Erweiterung). Ausschließlich über Jahr/Monat/Tag-Komponenten
// (new Date(y, m, d) + setDate/setMonth), nie über Millisekunden-Offsets
// ("+ 24*60*60*1000"): an Tagen mit Sommerzeit-Umstellung ist ein Tag keine
// exakten 24 Stunden, reines Millisekunden-Rechnen würde dort ein falsches
// Datum liefern. Komponentenbasierte Arithmetik ist davon unabhängig -
// dieselbe Überlegung wie beim bereits vorhandenen localIsoDate()-Ansatz
// im Frontend (siehe utils/date.js), nur serverseitig für Datumswerte ohne
// Uhrzeit.

function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Server und Frontend laufen auf demselben Mac (siehe README: lokale
// Installation, kein Hosting) - dieselbe Wall-Clock-Zeitzone wie
// localIsoDate() im Frontend, nur serverseitig für diese Berechnung.
export function todayIso() {
  return toIso(new Date());
}

// "Monatsende testen" (Punkt 66): 31. Januar + 1 Monat ist der 28./29.
// Februar, nicht (wie JS' naives setMonth es liefern würde) der 2./3. März.
// Der Ziel-Tag wird auf die tatsächliche Länge des Zielmonats begrenzt.
function addMonthsClamped(date, months) {
  const day = date.getDate();
  const firstOfTarget = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(firstOfTarget.getFullYear(), firstOfTarget.getMonth() + 1, 0).getDate();
  firstOfTarget.setDate(Math.min(day, daysInTargetMonth));
  return firstOfTarget;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function stepOnce(date, freq, interval) {
  if (freq === "monthly") return addMonthsClamped(date, interval);
  const next = new Date(date);
  next.setDate(next.getDate() + (freq === "weekly" ? interval * 7 : interval));
  return next;
}

// Ein einzelnes nächstes Vorkommen ab einem Referenzdatum. "Nur werktags"
// rückt nach dem Schritt so lange weiter, bis ein Werktag erreicht ist -
// fällt der berechnete Tag auf ein Wochenende, rutscht er auf den
// nächsten Werktag statt auf einen beliebigen Wochentag zu springen.
export function computeNextOccurrence(fromIso, recurrence) {
  const date = stepOnce(parseIso(fromIso), recurrence.freq, recurrence.interval || 1);
  if (recurrence.weekdaysOnly) {
    while (isWeekend(date)) date.setDate(date.getDate() + 1);
  }
  return toIso(date);
}

// Verhindert einen unkontrollierten Rückstand nach längerer Abwesenheit
// (Punkt 66: "keine unkontrollierte Erzeugung hunderter Rückstände"): bei
// festem Rhythmus wird ab dem ursprünglich fälligen Datum so lange
// weitergerechnet, bis ein Termin in der Zukunft (>= heute) erreicht ist,
// aber es entsteht dabei nur GENAU EIN neuer Termin für dieses nächste
// Vorkommen - nie einer pro übersprungenem Intervall. `skipped` zählt die
// übersprungenen Vorkommen, damit der Aufrufer das sichtbar machen kann,
// statt sie stillschweigend verschwinden zu lassen.
export function nextOccurrenceAfterGap(fromIso, recurrence, todayIso) {
  let next = computeNextOccurrence(fromIso, recurrence);
  let skipped = 0;
  const MAX_ITERATIONS = 10000; // Sicherheitsnetz gegen eine Endlosschleife bei kaputten Daten
  for (let i = 0; next < todayIso && i < MAX_ITERATIONS; i++) {
    next = computeNextOccurrence(next, recurrence);
    skipped++;
  }
  return { next, skipped };
}

// Berechnet die nächste Instanz für eine wiederkehrende Aufgabe, oder null
// wenn die Serie beendet ist (recurrence.until überschritten).
// mode "nach_abschluss": ab dem tatsächlichen Abschlussdatum (heute) -
//   kann per Definition keinen Rückstand aufbauen.
// mode "fest": ab dem ursprünglich fälligen Datum, mit Rückstands-Deckelung
//   über nextOccurrenceAfterGap.
export function planNextOccurrence({ recurrence, dueDate, todayIso }) {
  if (!recurrence) return null;
  const base = recurrence.mode === "nach_abschluss" ? todayIso : dueDate || todayIso;
  const { next, skipped } =
    recurrence.mode === "nach_abschluss"
      ? { next: computeNextOccurrence(base, recurrence), skipped: 0 }
      : nextOccurrenceAfterGap(base, recurrence, todayIso);

  if (recurrence.until && next > recurrence.until) return null;
  return { dueDate: next, skippedCount: skipped };
}
