import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { AreaBadge, AREA_LABELS } from "../components/ui/AreaBadge";

const AREAS = ["corelegal", "evermont", "nachhilfe", "allgemein"];

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

export function Kalender() {
  const [view, setView] = useState("woche");
  const [areaFilter, setAreaFilter] = useState("alle");
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const from = startOfDay(new Date());
    const to = view === "tag" ? addDays(from, 1) : addDays(from, 7);
    try {
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const data = await apiFetch(`/calendar/events?${params}`);
      setEvents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [view]);

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
            { key: "tag", label: "Heute" },
            { key: "woche", label: "Woche" },
          ].map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                view === v.key
                  ? "border-accent-500/40 bg-accent-500/15 text-accent-400"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {["alle", ...AREAS].map((a) => (
            <button
              key={a}
              onClick={() => setAreaFilter(a)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                areaFilter === a
                  ? "border-accent-500/40 bg-accent-500/15 text-accent-400"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06]"
              }`}
            >
              {a === "alle" ? "Alle" : AREA_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      {error && <GlassCard className="text-sm text-red-400">{error}</GlassCard>}
      {loading && !error && <p className="text-sm text-slate-500">Lade Termine…</p>}

      {!loading && !error && Object.keys(groups).length === 0 && (
        <p className="py-8 text-center text-sm text-slate-500">Keine Termine in diesem Zeitraum.</p>
      )}

      <div className="space-y-5">
        {Object.entries(groups).map(([day, dayEvents]) => (
          <div key={day}>
            <h2 className="mb-2 text-sm font-medium capitalize text-slate-400">{day}</h2>
            <div className="space-y-2">
              {dayEvents.map((ev) => (
                <GlassCard key={ev.id} className="flex items-center gap-3 !p-4">
                  <div className="w-16 shrink-0 text-xs text-slate-400">
                    {ev.allDay
                      ? "ganztägig"
                      : new Date(ev.start).toLocaleTimeString("de-DE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-100">{ev.title}</p>
                    {ev.location && <p className="truncate text-xs text-slate-500">{ev.location}</p>}
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
