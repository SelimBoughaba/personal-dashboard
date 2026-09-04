import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { AreaBadge } from "../components/ui/AreaBadge";
import { useAreas } from "../context/AreasContext";

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7; // Montag = 0
  return addDays(d, -day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function rangeFor(view, refDate) {
  if (view === "tag") {
    const from = startOfDay(refDate);
    return { from, to: addDays(from, 1) };
  }
  if (view === "woche") {
    const from = startOfWeek(refDate);
    return { from, to: addDays(from, 7) };
  }
  const from = startOfMonth(refDate);
  return { from, to: addMonths(from, 1) };
}

function rangeLabel(view, refDate) {
  if (view === "tag") return refDate.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  if (view === "woche") {
    const { from, to } = rangeFor("woche", refDate);
    const last = addDays(to, -1);
    return `${from.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${last.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  }
  return refDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function step(view, refDate, direction) {
  if (view === "tag") return addDays(refDate, direction);
  if (view === "woche") return addDays(refDate, direction * 7);
  return addMonths(refDate, direction);
}

export function Kalender() {
  const { activeAreas } = useAreas();
  const [view, setView] = useState("woche");
  const [refDate, setRefDate] = useState(() => new Date());
  const [areaFilter, setAreaFilter] = useState("alle");
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { from, to } = rangeFor(view, refDate);
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const data = await apiFetch(`/calendar/events?${params}`);
      setEvents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [view, refDate]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = areaFilter === "alle" ? events : events.filter((e) => e.area === areaFilter);

  const groups = filtered.reduce((acc, ev) => {
    const day = new Date(ev.start).toLocaleDateString("de-DE", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    });
    (acc[day] ||= []).push(ev);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[
            { key: "tag", label: "Tag" },
            { key: "woche", label: "Woche" },
            { key: "monat", label: "Monat" },
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                view === v.key
                  ? "border-white/20 bg-white/10 text-ivory"
                  : "border-white/10 bg-white/[0.03] text-ivory/55 hover:bg-white/[0.06]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ id: "alle", label: "Alle" }, ...activeAreas].map((a) => (
            <button
              key={a.id}
              onClick={() => setAreaFilter(a.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                areaFilter === a.id
                  ? "border-white/20 bg-white/10 text-ivory"
                  : "border-white/10 bg-white/[0.03] text-ivory/55 hover:bg-white/[0.06]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRefDate((d) => step(view, d, -1))}
            aria-label="Zurück"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ivory/70 hover:bg-white/[0.06]"
          >
            ‹
          </button>
          <button
            onClick={() => setRefDate(new Date())}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-ivory/70 hover:bg-white/[0.06]"
          >
            Heute
          </button>
          <button
            onClick={() => setRefDate((d) => step(view, d, 1))}
            aria-label="Weiter"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ivory/70 hover:bg-white/[0.06]"
          >
            ›
          </button>
        </div>
        <p className="text-sm font-medium capitalize text-ivory/80">{rangeLabel(view, refDate)}</p>
      </div>

      {error && <GlassCard className="text-sm text-status-hoch">{error}</GlassCard>}
      {loading && !error && <p className="text-sm text-ivory/40">Lade Termine…</p>}

      {!loading && !error && Object.keys(groups).length === 0 && (
        <p className="py-8 text-center text-sm text-ivory/40">Keine Termine in diesem Zeitraum.</p>
      )}

      <div className="space-y-5">
        {Object.entries(groups).map(([day, dayEvents]) => (
          <div key={day}>
            <h2 className="mb-2 text-sm font-medium capitalize text-ivory/55">{day}</h2>
            <div className="space-y-2">
              {dayEvents.map((ev) => (
                <GlassCard key={ev.id} className="flex items-center gap-3 !p-4">
                  <div className="w-16 shrink-0 text-xs text-ivory/55">
                    {ev.allDay
                      ? "ganztägig"
                      : new Date(ev.start).toLocaleTimeString("de-DE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ivory">{ev.title}</p>
                    {ev.location && <p className="truncate text-xs text-ivory/40">{ev.location}</p>}
                  </div>
                  <AreaBadge area={ev.area} />
                </GlassCard>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
