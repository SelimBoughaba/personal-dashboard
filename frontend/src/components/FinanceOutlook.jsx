import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { GlassCard } from "./ui/GlassCard";
import { StatTile } from "./ui/StatTile";

function formatAmount(value) {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const TYPE_LABEL = { rechnung: "Rechnung", vertrag: "Vertrag" };
const TYPE_PATH = { rechnung: "/finanzen", vertrag: "/vertraege" };
const BUCKET_LABEL = { bezahlt: "Bezahlt", geplant: "Geplant", unbekannt: "Unklar" };

// Finanzieller Ausblick (Punkt 71): "Offene Rechnungen und wiederkehrende
// Verträge zu einer 30-/90-Tage-Vorschau verbinden; bezahlt, geplant und
// unbekannt trennen." Bewusst KEIN Kontostand/keine Liquidität - siehe
// backend/src/financeOutlook.js für die vollständige Begründung. Diese
// Komponente stellt nur dar, was die Backend-Berechnung liefert.
export function FinanceOutlook() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [windowDays, setWindowDays] = useState("30");

  useEffect(() => {
    apiFetch("/finance-outlook")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-status-hoch">{error}</p>;
  if (!data) return null;

  const win = data.windows[windowDays];

  return (
    <GlassCard className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-ivory/65">Finanzieller Ausblick</h2>
          <p className="mt-0.5 text-xs text-ivory/55">
            Bekannte Verpflichtungen aus offenen Rechnungen und Verträgen – kein Kontostand, keine Bankanbindung.
          </p>
        </div>
        <div className="flex gap-1 rounded-control border border-white/10 bg-white/[0.03] p-0.5">
          {["30", "90"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setWindowDays(d)}
              className={`rounded-control px-3 py-1 text-xs font-bold transition-colors ${
                windowDays === d ? "bg-accent text-ink" : "text-ivory/65 hover:text-ivory"
              }`}
            >
              {d} Tage
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Bezahlt" value={formatAmount(win.paidTotal)} />
        <StatTile label="Geplant" value={formatAmount(win.plannedTotal)} />
        <StatTile label="Unklar" value={win.unknownCount} hint={win.unknownCount > 0 ? "Betrag oder Datum fehlt" : undefined} />
      </div>

      {win.items.length === 0 && <p className="text-xs text-ivory/55">Keine bekannten Verpflichtungen in diesem Zeitraum.</p>}

      {win.items.length > 0 && (
        <ul className="space-y-1.5">
          {win.items.map((item) => (
            <li
              key={`${item.type}-${item.id}-${item.date || "kein-datum"}`}
              className="flex items-center justify-between gap-2 rounded-control border border-white/10 bg-white/[0.02] px-2.5 py-1.5"
            >
              <Link to={TYPE_PATH[item.type]} className="min-w-0 flex-1">
                <span className="text-xs text-ivory/55">{TYPE_LABEL[item.type]}</span>
                <p className="truncate text-sm text-ivory/85">{item.title}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-2 text-right">
                <span className="text-xs text-ivory/55">
                  {item.date ? new Date(item.date).toLocaleDateString("de-DE") : "ohne Datum"}
                </span>
                <span className="text-sm font-bold text-ivory/90">{formatAmount(item.amount)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    item.bucket === "bezahlt"
                      ? "bg-status-niedrig/15 text-status-niedrig"
                      : item.bucket === "unbekannt"
                        ? "bg-status-mittel/15 text-status-mittel"
                        : "bg-white/10 text-ivory/70"
                  }`}
                >
                  {BUCKET_LABEL[item.bucket]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
