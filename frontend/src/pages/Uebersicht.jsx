import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { localIsoDate } from "../utils/date";
import { mergeTagesEntries, TAGESLINIE_TYPE_LABEL, TAGESLINIE_TYPE_PATH } from "../utils/tageslinie";
import { GlassCard } from "../components/ui/GlassCard";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { EmptyState } from "../components/ui/EmptyState";
import { Select } from "../components/ui/Field";
import { QuickCapture } from "../components/QuickCapture";
import { RelatedObjects } from "../components/RelatedObjects";
import { useAreas } from "../context/AreasContext";

// Eine Arbeitsfläche statt einer Kachelwand (Punkt 53): Kopfleiste (Datum/
// Begrüßung, Bereichsfilter, Suche, Erfassen), darunter die Tageslinie als
// dominierende Fläche, rechts nur bei Auswahl eine Vorgangsakte - ohne
// Auswahl höchstens eine kurze, begründete Liste nächster Schritte statt
// einer leeren, dauerhaft reservierten Spalte. Löst die vorherige
// Kennzahlen-/Kachelwand aus vier einzeln ein-/ausblendbaren Widgets ab.

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Guten Morgen";
  if (h >= 12 && h < 18) return "Guten Tag";
  if (h >= 18 && h < 22) return "Guten Abend";
  return "Gute Nacht";
}

function daysBetween(pastIso, todayIso) {
  const a = new Date(`${pastIso}T00:00:00`);
  const b = new Date(`${todayIso}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function formatShortDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function Uebersicht() {
  const { activeAreas } = useAreas();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [briefingText, setBriefingText] = useState("");
  const [editingBriefing, setEditingBriefing] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [errors, setErrors] = useState({});

  const [areaFilter, setAreaFilter] = useState("alle");
  const [selectedKey, setSelectedKey] = useState(null);
  // closed -> opening (im DOM, noch an Startposition) -> open (Zielzustand,
  // Transition läuft) -> closing (Transition zurück, dann entfernen).
  const [panelState, setPanelState] = useState("closed");

  const load = useCallback(async () => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const eventParams = new URLSearchParams({ from: dayStart.toISOString(), to: dayEnd.toISOString() });

    const results = await Promise.allSettled([
      apiFetch("/tasks?area=alle&sort=due_date"),
      apiFetch(`/calendar/events?${eventParams}`),
      apiFetch("/invoices?area=alle&status=alle"),
      apiFetch("/settings"),
    ]);
    const [tasksR, eventsR, invoicesR, settingsR] = results;
    if (tasksR.status === "fulfilled") setTasks(tasksR.value);
    if (eventsR.status === "fulfilled") setEvents(eventsR.value);
    if (invoicesR.status === "fulfilled") setInvoices(invoicesR.value);
    if (settingsR.status === "fulfilled") {
      const s = settingsR.value;
      setName(s["profile.name"] || "");
      setBriefingText(s["briefing.text"] || "");
    }
    setSettingsLoaded(true);
    setErrors({
      tasks: tasksR.status === "rejected" ? tasksR.reason.message : null,
      events: eventsR.status === "rejected" ? eventsR.reason.message : null,
      invoices: invoicesR.status === "rejected" ? invoicesR.reason.message : null,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ein per Bereichsfilter herausgefiltertes ausgewähltes Objekt darf keine
  // verwaiste Vorgangsakte hinterlassen.
  useEffect(() => {
    setSelectedKey(null);
    setPanelState("closed");
  }, [areaFilter]);

  async function saveName(e) {
    e.preventDefault();
    setEditingName(false);
    await apiFetch("/settings/profile.name", { method: "PUT", body: JSON.stringify({ value: name.trim() }) });
  }

  async function saveBriefing() {
    setEditingBriefing(false);
    await apiFetch("/settings/briefing.text", { method: "PUT", body: JSON.stringify({ value: briefingText.trim() }) });
  }

  const todayIso = localIsoDate();

  const filteredTasks = areaFilter === "alle" ? tasks : tasks.filter((t) => t.area === areaFilter);
  const filteredEvents = areaFilter === "alle" ? events : events.filter((e) => e.area === areaFilter);
  const filteredInvoices = areaFilter === "alle" ? invoices : invoices.filter((i) => i.area === areaFilter);

  const entries = useMemo(
    () => mergeTagesEntries({ tasks: filteredTasks, events: filteredEvents, invoices: filteredInvoices, todayIso }),
    [filteredTasks, filteredEvents, filteredInvoices, todayIso],
  );

  // "Höchstens eine kurze Liste begründeter nächster Schritte" (Punkt 53) -
  // bewusst NICHT dieselben Einträge wie die heutige Tageslinie, sondern ein
  // Ausblick: Überfälliges zuerst, danach hochpriorisierte anstehende
  // Aufgaben. Jeder Eintrag nennt seinen Grund, keine unbegründete Liste.
  const nextSteps = useMemo(() => {
    const steps = [];
    const overdueTasks = filteredTasks.filter((t) => t.status === "offen" && t.due_date && t.due_date < todayIso);
    for (const t of overdueTasks.slice(0, 2)) {
      const days = daysBetween(t.due_date, todayIso);
      steps.push({
        key: `task-${t.id}`,
        title: t.title,
        reason: `Überfällig seit ${days} ${days === 1 ? "Tag" : "Tagen"}`,
        path: "/aufgaben",
      });
    }
    const overdueInvoices = filteredInvoices.filter((i) => i.status === "offen" && i.due_date && i.due_date < todayIso);
    for (const i of overdueInvoices) {
      if (steps.length >= 3) break;
      const days = daysBetween(i.due_date, todayIso);
      steps.push({
        key: `invoice-${i.id}`,
        title: i.sender_name || i.subject,
        reason: `Zahlung überfällig seit ${days} ${days === 1 ? "Tag" : "Tagen"}`,
        path: "/finanzen",
      });
    }
    if (steps.length < 3) {
      const upcoming = filteredTasks
        .filter((t) => t.status === "offen" && t.priority === "hoch" && t.due_date && t.due_date > todayIso)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      for (const t of upcoming) {
        if (steps.length >= 3) break;
        steps.push({
          key: `task-${t.id}`,
          title: t.title,
          reason: `Bald fällig (${formatShortDate(t.due_date)}), hohe Priorität`,
          path: "/aufgaben",
        });
      }
    }
    return steps.slice(0, 3);
  }, [filteredTasks, filteredInvoices, todayIso]);

  const selected = entries.find((e) => e.key === selectedKey) || null;

  function openEntry(key) {
    setSelectedKey(key);
    setPanelState("opening");
    // Erst im nächsten Frame in den Zielzustand wechseln, damit der Browser
    // die Startposition tatsächlich rendert, bevor die Transition beginnt.
    requestAnimationFrame(() => requestAnimationFrame(() => setPanelState("open")));
  }

  function closeEntry() {
    setPanelState("closing");
    setTimeout(() => {
      setPanelState("closed");
      setSelectedKey(null);
    }, 160);
  }

  const panelMounted = panelState !== "closed";
  const panelAtTarget = panelState === "open";
  const showRightColumn = panelMounted || nextSteps.length > 0;

  return (
    <div className="space-y-6">
      {/* Kompakte Kopfleiste: Datum/Begrüßung, Bereichsfilter, Suche, Erfassen (Punkt 53) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {editingName ? (
            <form onSubmit={saveName}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                placeholder="Dein Name"
                className="rounded-control border border-white/10 bg-white/[0.04] px-2 py-1 text-[28px] font-bold text-ivory outline-none focus:border-accent/40"
              />
            </form>
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="cursor-pointer text-[28px] font-bold tracking-tight text-ivory"
              title="Namen bearbeiten"
            >
              {greeting()}
              {name ? `, ${name}` : ""}.
            </h1>
          )}
          <p className="mt-0.5 text-sm text-ivory/65">
            {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)} className="!w-auto">
            <option value="alle">Alle Bereiche</option>
            {activeAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("dashboard:open-search"))}
            aria-label="Suche öffnen"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-white/10 text-ivory/70 hover:bg-white/[0.06]"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
          <QuickCapture onCreated={load} />
        </div>
      </div>

      {settingsLoaded && (
        <GlassCard>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ivory">Tagesbriefing</h2>
            {!editingBriefing && (
              <button onClick={() => setEditingBriefing(true)} className="text-xs text-ivory/65 hover:text-ivory/80">
                Bearbeiten
              </button>
            )}
          </div>
          {editingBriefing ? (
            <textarea
              autoFocus
              rows={2}
              value={briefingText}
              onChange={(e) => setBriefingText(e.target.value)}
              onBlur={saveBriefing}
              placeholder="Trage hier ein, was dir heute wichtig ist – z. B. Fokus des Tages, Erinnerungen, Notizen…"
              className="w-full resize-y rounded-control border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ivory placeholder:text-ivory/35 outline-none focus:border-accent/40"
            />
          ) : briefingText ? (
            <p className="whitespace-pre-wrap text-sm text-ivory/85">{briefingText}</p>
          ) : (
            <p onClick={() => setEditingBriefing(true)} className="cursor-pointer text-sm text-ivory/65 hover:text-ivory/80">
              Noch kein Tagesbriefing eingerichtet. Klicke auf „Bearbeiten“, um deinen eigenen Text für heute
              einzutragen – dieser Bereich bleibt immer oben sichtbar.
            </p>
          )}
        </GlassCard>
      )}

      {/* Tageslinie als dominierende Arbeitsfläche + Vorgangsakte/Nächste Schritte (Punkte 53/57/58) */}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className={`min-w-0 flex-1 ${panelMounted ? "hidden lg:block" : ""}`}>
          {!settingsLoaded && <p className="text-sm text-ivory/65">Lädt…</p>}
          {settingsLoaded && (errors.tasks || errors.events || errors.invoices) && (
            <div className="mb-3 space-y-1">
              {errors.tasks && <p className="text-sm text-status-hoch">{errors.tasks}</p>}
              {errors.events && <p className="text-sm text-status-hoch">{errors.events}</p>}
              {errors.invoices && <p className="text-sm text-status-hoch">{errors.invoices}</p>}
            </div>
          )}
          {settingsLoaded && entries.length === 0 && (
            <EmptyState
              title="Nichts Dringendes für heute"
              description="Aufgaben, Termine und fällige Rechnungen von heute erscheinen hier. Über „Erfassen“ oben legst du direkt etwas Neues an."
            />
          )}
          {settingsLoaded && entries.length > 0 && (
            <ol className="relative space-y-3 border-l border-white/10 pl-6">
              {entries.map((entry) => {
                const isSelected = selectedKey === entry.key;
                return (
                  <li key={entry.key} className="relative">
                    <span
                      className={`absolute -left-[29px] top-4 h-2.5 w-2.5 rounded-full border-2 border-forest-950 ${
                        isSelected ? "bg-accent" : "bg-ivory/40"
                      }`}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => openEntry(entry.key)}
                      aria-current={isSelected ? "true" : undefined}
                      className={`glass-panel block w-full border p-3.5 text-left transition-colors duration-200 hover:bg-white/[0.04] ${
                        isSelected ? "border-accent/40" : "border-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-ivory/65">
                          {entry.time
                            ? entry.time.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
                            : "Ohne Uhrzeit"}{" "}
                          · {TAGESLINIE_TYPE_LABEL[entry.type]}
                        </span>
                        {entry.area && <AreaBadge area={entry.area} />}
                      </div>
                      <p className="mt-1.5 text-sm font-bold text-ivory">{entry.title}</p>
                      <p className="mt-0.5 text-xs text-ivory/65">{entry.detailLabel}</p>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {showRightColumn && (
          <div
            className="w-full shrink-0 lg:sticky lg:top-4 lg:w-96"
            style={
              panelMounted
                ? {
                    transition: `transform ${panelAtTarget ? "220ms" : "160ms"} cubic-bezier(0.32,0.72,0,1), opacity ${
                      panelAtTarget ? "220ms" : "160ms"
                    } cubic-bezier(0.32,0.72,0,1)`,
                    transform: panelAtTarget ? "translateX(0)" : "translateX(12px)",
                    opacity: panelAtTarget ? 1 : 0,
                  }
                : undefined
            }
          >
            {selected ? (
              <div className="overlay-panel space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-ivory/65">{TAGESLINIE_TYPE_LABEL[selected.type]}</p>
                    <h2 className="mt-0.5 text-lg font-bold text-ivory">{selected.title}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={closeEntry}
                    aria-label="Vorgangsakte schließen"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ivory/65 hover:bg-white/[0.06] hover:text-ivory"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-2 text-sm text-ivory/80">
                  <p>{selected.detailLabel}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {selected.area && <AreaBadge area={selected.area} />}
                    {selected.type === "task" && selected.raw.priority && <PriorityBadge priority={selected.raw.priority} />}
                  </div>
                  {selected.type === "task" && selected.raw.notes && (
                    <p className="whitespace-pre-wrap text-ivory/65">{selected.raw.notes}</p>
                  )}
                </div>

                {/* Termine kommen aus iCloud und haben keine eigene lokale
                    Zeile, auf die eine Verknüpfung zeigen könnte - Punkt 69
                    gilt daher nur für Aufgaben/Rechnungen hier. */}
                {selected.type !== "event" && (
                  <RelatedObjects type={selected.type === "task" ? "aufgabe" : "rechnung"} id={selected.raw.id} />
                )}

                <button
                  type="button"
                  onClick={() => navigate(TAGESLINIE_TYPE_PATH[selected.type])}
                  className="w-full rounded-control border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-ivory/85 hover:bg-white/[0.06]"
                >
                  In {selected.type === "task" ? "Aufgaben" : selected.type === "event" ? "Kalender" : "Finanzen"} öffnen
                </button>
              </div>
            ) : (
              <div className="overlay-panel space-y-3 p-5">
                <h2 className="text-sm font-bold text-ivory">Nächste Schritte</h2>
                <ul className="space-y-1">
                  {nextSteps.map((s) => (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => navigate(s.path)}
                        className="block w-full rounded-control px-2.5 py-2 text-left hover:bg-white/[0.05]"
                      >
                        <p className="truncate text-sm text-ivory">{s.title}</p>
                        <p className="text-xs text-ivory/65">{s.reason}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
