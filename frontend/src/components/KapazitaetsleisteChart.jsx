import { useState, useMemo } from "react";

// Punkt 60 der Design-Erweiterung: "Kapazitätsleiste mit bekannten
// Zeitblöcken" - zeigt die tatsächlich im Kalender eingetragenen, zeitlich
// bekannten Termine des heutigen Tages auf einer echten 24-Stunden-Achse.
// Bewusst KEINE erfundene "Tageskapazität" (z. B. eine angenommene
// Arbeitszeit von 9-17 Uhr) als Bezugsgröße - eine Uhrzeitachse von 0 bis 24
// Uhr ist real, keine Annahme über den Nutzer. Ganztägige Termine haben
// keine bekannte Zeitspanne und werden bewusst ausgeschlossen und benannt,
// nicht als 0-Dauer-Block gezählt ("fehlende Werte bleiben fehlend").
function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} Min.`;
  if (m === 0) return `${h} Std.`;
  return `${h} Std. ${m} Min.`;
}

function clampToToday(date, dayStart, dayEnd) {
  if (date < dayStart) return dayStart;
  if (date > dayEnd) return dayEnd;
  return date;
}

// Vereinigte (nicht überlappende) Zeitspanne aller Termine - eine sich
// überschneidende Doppelbuchung darf die verplante Zeit nicht doppelt zählen.
function mergedBookedHours(intervals) {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let totalMs = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const { start, end } = sorted[i];
    if (start <= curEnd) {
      curEnd = new Date(Math.max(curEnd.getTime(), end.getTime()));
    } else {
      totalMs += curEnd - curStart;
      curStart = start;
      curEnd = end;
    }
  }
  totalMs += curEnd - curStart;
  return totalMs / (1000 * 60 * 60);
}

export function KapazitaetsleisteChart({ events }) {
  const [showTable, setShowTable] = useState(false);

  const { blocks, excludedAllDay, bookedHours, dayStart, dayEnd } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let excluded = 0;
    const intervals = [];
    for (const e of events) {
      if (e.allDay) {
        excluded++;
        continue;
      }
      const s = clampToToday(new Date(e.start), start, end);
      const en = clampToToday(new Date(e.end), start, end);
      if (en <= s) continue;
      intervals.push({ start: s, end: en, title: e.title, area: e.area });
    }
    intervals.sort((a, b) => a.start - b.start);

    return {
      blocks: intervals,
      excludedAllDay: excluded,
      bookedHours: mergedBookedHours(intervals),
      dayStart: start,
      dayEnd: end,
    };
  }, [events]);

  if (blocks.length === 0 && excludedAllDay === 0) return null;

  const dayMs = dayEnd - dayStart;
  const asOf = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  const hourMarks = [0, 6, 12, 18, 24];

  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ivory">Kapazität heute</h2>
          <p className="mt-0.5 text-xs text-ivory/65">
            {blocks.length === 0
              ? "Keine bekannten Zeitblöcke heute"
              : `${blocks.length} Termin${blocks.length === 1 ? "" : "e"} · ${formatHours(bookedHours)} verplant`}
          </p>
        </div>
        {blocks.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs text-ivory/65 underline hover:text-ivory"
          >
            {showTable ? "Als Leiste anzeigen" : "Als Tabelle anzeigen"}
          </button>
        )}
      </div>

      {blocks.length > 0 &&
        (showTable ? (
          <table className="w-full text-sm">
            <caption className="sr-only">Heutige Kalendertermine mit bekannter Uhrzeit</caption>
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-ivory/65">
                <th scope="col" className="py-1.5 font-normal">
                  Zeitraum
                </th>
                <th scope="col" className="py-1.5 font-normal">
                  Termin
                </th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-1.5 whitespace-nowrap text-ivory/65">
                    {b.start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} –{" "}
                    {b.end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="py-1.5 text-ivory/85">{b.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            <div
              className="relative h-8 w-full overflow-hidden rounded-control bg-white/[0.04]"
              role="img"
              aria-label={`Kapazitätsleiste: ${blocks
                .map(
                  (b) =>
                    `${b.title} von ${b.start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} bis ${b.end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`,
                )
                .join(", ")}`}
            >
              {blocks.map((b, i) => {
                const leftPct = ((b.start - dayStart) / dayMs) * 100;
                const widthPct = Math.max(((b.end - b.start) / dayMs) * 100, 0.5);
                return (
                  <div
                    key={i}
                    className="group absolute top-0 h-full bg-accent/75 transition-colors duration-150 hover:bg-accent"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-white/10 bg-forest-950 px-2.5 py-1.5 text-xs text-ivory shadow-glass group-hover:block">
                      <p className="font-bold">{b.title}</p>
                      <p className="text-ivory/65">
                        {b.start.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} –{" "}
                        {b.end.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-ivory/55">
              {hourMarks.map((h) => (
                <span key={h}>{String(h).padStart(2, "0")}:00</span>
              ))}
            </div>
          </div>
        ))}

      <p className="mt-3 text-[11px] text-ivory/55">
        Einheiten: Stunden, 24-Stunden-Achse (00–24 Uhr) · Quelle: Kalendertermine mit bekannter Uhrzeit · Datenstand:{" "}
        {asOf}
        {excludedAllDay > 0 &&
          ` · ${excludedAllDay} ganztägige${excludedAllDay === 1 ? "r" : ""} Termin${excludedAllDay === 1 ? "" : "e"} ohne feste Uhrzeit nicht enthalten`}
      </p>
    </div>
  );
}
