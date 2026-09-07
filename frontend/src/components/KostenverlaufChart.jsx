import { useState, useMemo } from "react";

// Punkt 60 der Design-Erweiterung: "Kostenverlauf mit erkennbaren Zeiträumen
// und Beträgen" statt dekorativer Donuts/erfundener Kennzahlen. Ein
// einfarbiges Balkendiagramm (eine Kennzahl: fällige Beträge je Monat),
// mit Textzusammenfassung, Einheiten, Quelle, Datenstand und einer
// zugänglichen Tabellenalternative - genau das, was Punkt 60 fordert, nicht
// mehr. Fehlende Fälligkeitsdaten werden ausgeschlossen und benannt, nicht
// stillschweigend als 0 gezählt ("fehlende Werte bleiben fehlend, nicht
// null") - ein echter Monat ohne fällige Rechnung zeigt dagegen eine
// tatsächliche 0, weil das ein reales Ergebnis ist, kein fehlender Wert.
function formatAmount(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function buildMonths(invoices) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      shortLabel: d.toLocaleDateString("de-DE", { month: "short" }),
      label: d.toLocaleDateString("de-DE", { month: "long", year: "numeric" }),
      total: 0,
    });
  }
  const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
  let excluded = 0;
  for (const inv of invoices) {
    if (!inv.due_date) {
      excluded++;
      continue;
    }
    const bucket = byKey[inv.due_date.slice(0, 7)];
    if (bucket) bucket.total += inv.amount || 0;
  }
  return { months, excluded };
}

export function KostenverlaufChart({ invoices, areaLabel }) {
  const [showTable, setShowTable] = useState(false);
  const { months, excluded } = useMemo(() => buildMonths(invoices), [invoices]);
  const maxTotal = Math.max(...months.map((m) => m.total), 0);
  const total = months.reduce((s, m) => s + m.total, 0);
  const asOf = new Date().toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });

  if (invoices.length === 0) return null;

  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ivory">Kostenverlauf</h2>
          <p className="mt-0.5 text-xs text-ivory/65">
            {formatAmount(total)} fällig in den letzten 6 Monaten{areaLabel ? ` · ${areaLabel}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs text-ivory/65 underline hover:text-ivory"
        >
          {showTable ? "Als Grafik anzeigen" : "Als Tabelle anzeigen"}
        </button>
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">Fällige Rechnungsbeträge nach Monat, in Euro</caption>
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-ivory/65">
              <th scope="col" className="py-1.5 font-normal">
                Monat
              </th>
              <th scope="col" className="py-1.5 text-right font-normal">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key} className="border-b border-white/5">
                <td className="py-1.5 text-ivory/85">{m.label}</td>
                <td className="py-1.5 text-right text-ivory/85">{formatAmount(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div
            className="flex items-end gap-2"
            style={{ height: 140 }}
            role="img"
            aria-label={`Balkendiagramm Kostenverlauf: ${months.map((m) => `${m.label} ${formatAmount(m.total)}`).join(", ")}`}
          >
            {months.map((m) => (
              <div key={m.key} className="group relative flex h-full flex-1 items-end">
                <div
                  className="w-full rounded-t-[4px] bg-accent/75 transition-colors duration-150 group-hover:bg-accent"
                  style={{ height: m.total === 0 ? "2px" : `${Math.max((m.total / maxTotal) * 100, 4)}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-white/10 bg-forest-950 px-2.5 py-1.5 text-xs text-ivory shadow-glass group-hover:block">
                  <p className="font-bold">{formatAmount(m.total)}</p>
                  <p className="text-ivory/65">{m.label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {months.map((m) => (
              <span key={m.key} className="flex-1 text-center text-[11px] text-ivory/55">
                {m.shortLabel}
              </span>
            ))}
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] text-ivory/55">
        Einheiten: Euro, nach Fälligkeitsmonat · Quelle: erfasste Rechnungen · Datenstand: {asOf}
        {excluded > 0 && ` · ${excluded} Rechnung${excluded === 1 ? "" : "en"} ohne Fälligkeitsdatum nicht enthalten`}
      </p>
    </div>
  );
}
