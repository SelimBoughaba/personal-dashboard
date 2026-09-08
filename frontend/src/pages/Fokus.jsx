import { useEffect, useState, useCallback, useMemo } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { RelatedObjects } from "../components/RelatedObjects";

// Fokusmodus mit geringer Ablenkung (Punkt 67): eine ausgewählte Aufgabe,
// ihre verknüpften Unterlagen und ein optionaler Timer - bewusst ganz ohne
// Backend-Speicherung. "Kein verstecktes Aktivitätstracking" heißt hier:
// keine Historie vergangener Fokus-Sitzungen, kein Produktivitätsscore,
// keine Streaks - nur der aktuelle Zustand, rein lokal im Browser, damit
// beim Neuladen der Seite nichts verloren geht.
const STORAGE_KEY = "dashboard_focus_session";

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { taskId: null, startedAt: null, accumulatedSeconds: 0, running: false };
    return JSON.parse(raw);
  } catch {
    return { taskId: null, startedAt: null, accumulatedSeconds: 0, running: false };
  }
}

function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage kann fehlen/blockiert sein (privates Fenster) - der
    // Timer bleibt für die laufende Sitzung nutzbar, nur ohne Persistenz
    // über einen Neuladen hinweg.
  }
}

// Zeitstempel statt laufendes Sekundenzählen persistieren (Punkt 67): nur
// beim Start/Pause/Zurücksetzen wird geschrieben, nicht jede Sekunde -
// die Anzeige tickt lokal per Intervall, ohne dass dafür irgendwas
// gespeichert werden muss.
function elapsedSeconds(session, nowMs) {
  const running = session.running && session.startedAt;
  const liveSeconds = running ? Math.floor((nowMs - new Date(session.startedAt).getTime()) / 1000) : 0;
  return session.accumulatedSeconds + liveSeconds;
}

function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function Fokus() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextEvent, setNextEvent] = useState(null);
  const [eventError, setEventError] = useState("");
  const [session, setSession] = useState(loadSession);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      apiFetch("/tasks?area=alle&sort=priority"),
      apiFetch(
        `/calendar/events?${new URLSearchParams({
          from: new Date().toISOString(),
          to: (() => {
            const d = new Date();
            d.setHours(23, 59, 59, 999);
            return d.toISOString();
          })(),
        })}`,
      ),
    ]);
    const [tasksR, eventsR] = results;
    if (tasksR.status === "fulfilled") setTasks(tasksR.value.filter((t) => t.status === "offen"));
    if (eventsR.status === "fulfilled") {
      const upcoming = eventsR.value.filter((e) => !e.allDay).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
      setNextEvent(upcoming || null);
      setEventError("");
    } else {
      setEventError(eventsR.reason.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Nur für die Anzeige - kein Schreiben in localStorage bei jedem Tick.
  useEffect(() => {
    if (!session.running) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [session.running]);

  const selectedTask = tasks.find((t) => t.id === session.taskId) || null;

  function updateSession(patch) {
    setSession((prev) => {
      const next = { ...prev, ...patch };
      saveSession(next);
      return next;
    });
  }

  function selectTask(id) {
    updateSession({ taskId: id, startedAt: null, accumulatedSeconds: 0, running: false });
  }

  function startTimer() {
    updateSession({ startedAt: new Date().toISOString(), running: true });
  }

  function pauseTimer() {
    updateSession({ accumulatedSeconds: elapsedSeconds(session, Date.now()), startedAt: null, running: false });
  }

  function resetTimer() {
    updateSession({ startedAt: session.running ? new Date().toISOString() : null, accumulatedSeconds: 0 });
  }

  function endFocus() {
    updateSession({ taskId: null, startedAt: null, accumulatedSeconds: 0, running: false });
  }

  const displaySeconds = useMemo(() => elapsedSeconds(session, now), [session, now]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fokus"
        description="Eine Aufgabe, ihre Unterlagen, ein optionaler Timer - ohne Produktivitätsscore, ohne Streaks."
      />

      {!selectedTask ? (
        <GlassCard>
          <h2 className="mb-3 text-sm font-bold text-ivory">Woran möchtest du gerade arbeiten?</h2>
          {loading && <p className="text-sm text-ivory/65">Lädt…</p>}
          {!loading && tasks.length === 0 && (
            <EmptyState title="Keine offenen Aufgaben" description="Lege unter „Aufgaben“ zuerst etwas an, um dich darauf zu fokussieren." />
          )}
          {!loading && tasks.length > 0 && (
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTask(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-control border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left hover:bg-white/[0.05]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ivory/85">{t.title}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <AreaBadge area={t.area} />
                    <PriorityBadge priority={t.priority} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-4">
          <GlassCard className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-ivory/65">Im Fokus</p>
                <h2 className="mt-0.5 text-xl font-bold text-ivory">{selectedTask.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AreaBadge area={selectedTask.area} />
                  <PriorityBadge priority={selectedTask.priority} />
                  {selectedTask.due_date && (
                    <span className="text-xs text-ivory/55">
                      fällig {new Date(selectedTask.due_date).toLocaleDateString("de-DE")}
                    </span>
                  )}
                </div>
                {selectedTask.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ivory/70">{selectedTask.notes}</p>}
              </div>
              <Button variant="ghost" className="shrink-0 text-xs" onClick={endFocus}>
                Fokus beenden
              </Button>
            </div>
            {/* "Notwendige Unterlagen" aus Punkt 67 = dieselben Kontextlinks
                wie überall sonst (Punkt 69), keine zweite Implementierung. */}
            <RelatedObjects type="aufgabe" id={selectedTask.id} />
          </GlassCard>

          <GlassCard>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ivory/55">Timer</p>
            <div className="flex items-center gap-4">
              <span className="font-mono text-4xl font-bold text-ivory tabular-nums">{formatDuration(displaySeconds)}</span>
              <div className="flex gap-2">
                {session.running ? (
                  <Button variant="ghost" onClick={pauseTimer}>
                    Pausieren
                  </Button>
                ) : (
                  <Button onClick={startTimer}>{displaySeconds > 0 ? "Weiter" : "Starten"}</Button>
                )}
                <Button variant="ghost" onClick={resetTimer} disabled={displaySeconds === 0 && !session.running}>
                  Zurücksetzen
                </Button>
              </div>
            </div>
          </GlassCard>

          {/* Anzeige ohne Zwangsunterbrechung (Punkt 67) - eine ruhige
              Textzeile, kein Popup/keine Benachrichtigung. */}
          <GlassCard>
            <p className="text-xs font-bold uppercase tracking-wide text-ivory/55">Nächster Termin heute</p>
            {eventError && <p className="mt-1 text-sm text-status-hoch">{eventError}</p>}
            {!eventError && !nextEvent && <p className="mt-1 text-sm text-ivory/65">Keine weiteren Termine heute.</p>}
            {nextEvent && (
              <p className="mt-1 text-sm text-ivory/85">
                {new Date(nextEvent.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} –{" "}
                {nextEvent.title}
              </p>
            )}
          </GlassCard>
        </div>
      )}
    </div>
  );
}
