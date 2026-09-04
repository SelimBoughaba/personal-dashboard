import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { useAreas } from "../context/AreasContext";

const GRID_START_HOUR = 0;
const GRID_END_HOUR = 24;
const HOUR_HEIGHT = 56; // px pro Stunde im Tag-/Wochenraster
const DEFAULT_SCROLL_HOUR = 7; // beim Öffnen zu dieser Uhrzeit scrollen

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

function isoDate(date) {
  return date.toISOString().slice(0, 10);
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
  // Monat: volle Wochen von Montag vor dem 1. bis Sonntag nach dem Letzten,
  // damit die Rasteransicht keine angeschnittenen Wochen zeigt.
  const monthStart = startOfMonth(refDate);
  const monthEnd = addDays(addMonths(monthStart, 1), -1);
  return { from: startOfWeek(monthStart), to: addDays(startOfWeek(addDays(monthEnd, 1)), 0) };
}

function rangeLabel(view, refDate) {
  if (view === "tag") return refDate.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  if (view === "woche") {
    const from = startOfWeek(refDate);
    const last = addDays(from, 6);
    return `${from.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${last.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  }
  return refDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function step(view, refDate, direction) {
  if (view === "tag") return addDays(refDate, direction);
  if (view === "woche") return addDays(refDate, direction * 7);
  return addMonths(refDate, direction);
}

function clampToDay(date, day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  if (date < dayStart) return dayStart;
  if (date > dayEnd) return dayEnd;
  return date;
}

// Einfache Intervall-Spaltenzuordnung für sich überschneidende Termine
// an einem Tag: jeder Termin bekommt die erste Spalte, deren letzter
// Termin bereits vorbei ist, sonst eine neue Spalte.
function layoutDayEvents(events) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  const columnEnds = [];
  const placed = sorted.map((ev) => {
    let col = columnEnds.findIndex((end) => end <= ev.startMin);
    if (col === -1) {
      col = columnEnds.length;
      columnEnds.push(ev.endMin);
    } else {
      columnEnds[col] = ev.endMin;
    }
    return { ...ev, col };
  });
  const totalCols = columnEnds.length || 1;
  return placed.map((ev) => ({ ...ev, totalCols }));
}

function EventBlock({ ev, areaColor, compact }) {
  const top = (ev.startMin / 60) * HOUR_HEIGHT;
  const height = Math.max(18, ((ev.endMin - ev.startMin) / 60) * HOUR_HEIGHT);
  const widthPct = 100 / ev.totalCols;
  return (
    <div
      className="absolute overflow-hidden rounded-lg px-1.5 py-0.5 text-[11px] leading-tight text-ivory shadow"
      style={{
        top,
        height,
        left: `${ev.col * widthPct}%`,
        width: `calc(${widthPct}% - 3px)`,
        background: `${areaColor}33`,
        borderLeft: `3px solid ${areaColor}`,
      }}
      title={ev.title}
    >
      {!compact && <span className="font-medium">{ev.startLabel}</span>} {ev.title}
    </div>
  );
}

function TimeGrid({ days, eventsByDay, byId, view }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
    }
  }, [view]);

  const hours = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);

  return (
    <GlassCard className="!p-0 overflow-hidden">
      <div className="flex border-b border-white/10">
        <div className="w-14 shrink-0" />
        {days.map((day) => (
          <div key={isoDate(day)} className="flex-1 border-l border-white/10 px-2 py-2 text-center">
            <p className="text-xs text-ivory/45">{day.toLocaleDateString("de-DE", { weekday: "short" })}</p>
            <p className="text-sm font-medium text-ivory">{day.getDate()}</p>
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="flex max-h-[65vh] overflow-y-auto">
        <div className="w-14 shrink-0">
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-white/5 pr-2 text-right text-[11px] text-ivory/35">
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((day) => {
          const dayKey = isoDate(day);
          const dayEvents = layoutDayEvents(eventsByDay[dayKey] || []);
          return (
            <div key={dayKey} className="relative flex-1 border-l border-white/10">
              {hours.map((h) => (
                <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-white/5" />
              ))}
              {dayEvents.map((ev) => (
                <EventBlock key={ev.id} ev={ev} areaColor={byId[ev.area]?.color || "#94a08f"} />
              ))}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function MonthGrid({ refDate, eventsByDay, byId }) {
  const { from, to } = rangeFor("monat", refDate);
  const days = [];
  for (let d = new Date(from); d < to; d = addDays(d, 1)) days.push(new Date(d));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const currentMonth = refDate.getMonth();
  const todayIso = isoDate(new Date());

  return (
    <GlassCard className="!p-0 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/10">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div key={d} className="border-l border-white/10 px-2 py-2 text-center text-xs text-ivory/45 first:border-l-0">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-white/5 last:border-b-0">
          {week.map((day) => {
            const dayKey = isoDate(day);
            const dayEvents = (eventsByDay[dayKey] || []).sort((a, b) => a.startMin - b.startMin);
            const isOtherMonth = day.getMonth() !== currentMonth;
            const isToday = dayKey === todayIso;
            return (
              <div
                key={dayKey}
                className={`min-h-[100px] border-l border-white/10 p-1.5 first:border-l-0 ${isOtherMonth ? "opacity-40" : ""}`}
              >
                <p className={`mb-1 text-xs ${isToday ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-lime text-ink" : "text-ivory/60"}`}>
                  {day.getDate()}
                </p>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className="truncate rounded px-1 py-0.5 text-[10px] text-ivory"
                      style={{ background: `${byId[ev.area]?.color || "#94a08f"}33`, borderLeft: `2px solid ${byId[ev.area]?.color || "#94a08f"}` }}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <p className="text-[10px] text-ivory/40">+{dayEvents.length - 3} mehr</p>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </GlassCard>
  );
}

export function Kalender() {
  const { activeAreas, byId } = useAreas();
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

  // Termine nach Kalendertag gruppieren, Uhrzeiten in Minuten seit
  // Mitternacht für die Raster-Positionierung vorbereiten. Mehrtägige
  // Termine werden pro Tag auf den jeweiligen Tagesausschnitt begrenzt.
  const eventsByDay = {};
  const allDayEvents = [];
  for (const ev of filtered) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    if (ev.allDay) {
      allDayEvents.push(ev);
      continue;
    }
    let cursor = startOfDay(start);
    const lastDay = startOfDay(end);
    while (cursor <= lastDay) {
      const dayKey = isoDate(cursor);
      const segStart = clampToDay(start, cursor);
      const segEnd = clampToDay(end, cursor);
      const startMin = segStart.getHours() * 60 + segStart.getMinutes();
      let endMin = segEnd.getHours() * 60 + segEnd.getMinutes();
      if (isoDate(segEnd) !== dayKey) endMin = 24 * 60;
      if (endMin > startMin) {
        (eventsByDay[dayKey] ||= []).push({
          ...ev,
          startMin,
          endMin,
          startLabel: segStart.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
        });
      }
      cursor = addDays(cursor, 1);
    }
  }

  const { from } = rangeFor(view, refDate);
  const dayCount = view === "tag" ? 1 : view === "woche" ? 7 : 0;
  const days = Array.from({ length: dayCount }, (_, i) => addDays(from, i));

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
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                areaFilter === a.id
                  ? "border-white/20 bg-white/10 text-ivory"
                  : "border-white/10 bg-white/[0.03] text-ivory/55 hover:bg-white/[0.06]"
              }`}
            >
              {a.color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: a.color }} />}
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

      {!loading && !error && allDayEvents.length > 0 && (
        <GlassCard className="!p-3">
          <p className="mb-1.5 text-xs text-ivory/45">Ganztägig</p>
          <div className="flex flex-wrap gap-1.5">
            {allDayEvents.map((ev) => (
              <span
                key={ev.id}
                className="rounded-lg px-2 py-1 text-xs text-ivory"
                style={{ background: `${byId[ev.area]?.color || "#94a08f"}33`, borderLeft: `3px solid ${byId[ev.area]?.color || "#94a08f"}` }}
              >
                {ev.title}
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      {!loading && !error && filtered.length === 0 && allDayEvents.length === 0 && (
        <p className="py-8 text-center text-sm text-ivory/40">Keine Termine in diesem Zeitraum.</p>
      )}

      {!loading && !error && (view === "tag" || view === "woche") && (
        <TimeGrid days={days} eventsByDay={eventsByDay} byId={byId} view={view} />
      )}
      {!loading && !error && view === "monat" && <MonthGrid refDate={refDate} eventsByDay={eventsByDay} byId={byId} />}
    </div>
  );
}
