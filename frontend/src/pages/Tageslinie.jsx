// Prototyp für Punkt 57 (Tageslinie) + Punkt 58 (Vorgangsakte) der
// Design-Erweiterung. Bewusst auf einer eigenen, zusätzlichen Route statt
// auf "/" - der Nutzer wollte das Konzept erst sehen, bevor die bestehende
// Übersicht angefasst wird ("Erst mal zeigen, dann entscheiden").
//
// Tageslinie: Aufgaben (fällig heute), Kalendertermine (heute) und fällige
// Rechnungen (heute) werden zu EINER chronologischen Liste zusammengeführt,
// statt wie bisher in getrennten Kacheln/Seiten zu stehen - "gleiche
// Grammatik" (Punkt 57).
//
// Vorgangsakte: Klick auf einen Eintrag öffnet ein Detailpanel (schmale
// Fenster: volle Ansicht: breite Fenster: Seitenpanel), ohne dass die Liste
// dabei neu geladen wird oder ihren Zustand verliert - "kein Overlay-
// Stapel" (Punkt 58). Motion exakt nach Punkt 62: 220ms Öffnen / 160ms
// Schließen, cubic-bezier(0.32,0.72,0,1), translateX(12px)+Opacity.
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { localIsoDate } from "../utils/date";
import { PageHeader } from "../components/ui/PageHeader";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PriorityBadge } from "../components/ui/PriorityBadge";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";

function formatAmount(value) {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatTime(date) {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

const TYPE_LABEL = { task: "Aufgabe", event: "Termin", invoice: "Rechnung" };
const TYPE_PATH = { task: "/aufgaben", event: "/kalender", invoice: "/finanzen" };

export function Tageslinie() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  // closed -> opening (im DOM, noch an Startposition) -> open (Zielzustand,
  // Transition läuft) -> closing (Transition zurück, dann entfernen).
  const [panelState, setPanelState] = useState("closed");
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const todayIso = localIsoDate();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const eventParams = new URLSearchParams({ from: dayStart.toISOString(), to: dayEnd.toISOString() });

    // allSettled statt all: ein nicht eingerichteter Kalender (häufig direkt
    // nach der Ersteinrichtung) soll nicht dazu führen, dass auch Aufgaben
    // und Rechnungen verschwinden - dieselbe Widerstandsfähigkeit wie in
    // Uebersicht.jsx (Punkt 20 der Basis-Härtung).
    const [tasksR, eventsR, invoicesR] = await Promise.allSettled([
      apiFetch("/tasks?area=alle&sort=due_date"),
      apiFetch(`/calendar/events?${eventParams}`),
      apiFetch("/invoices?area=alle&status=alle"),
    ]);

    const tasks = tasksR.status === "fulfilled" ? tasksR.value : [];
    const events = eventsR.status === "fulfilled" ? eventsR.value : [];
    const invoices = invoicesR.status === "fulfilled" ? invoicesR.value : [];

    const failed = [tasksR, eventsR, invoicesR].filter((r) => r.status === "rejected");
    setError(failed.length ? failed.map((r) => r.reason.message).join(" ") : "");

    const taskEntries = tasks
      .filter((t) => t.due_date === todayIso && t.status !== "erledigt")
      .map((t) => ({
        key: `task-${t.id}`,
        type: "task",
        time: null,
        title: t.title,
        area: t.area,
        detailLabel: "Fällig heute",
        raw: t,
      }));

    const invoiceEntries = invoices
      .filter((i) => i.due_date === todayIso && i.status === "offen")
      .map((i) => ({
        key: `invoice-${i.id}`,
        type: "invoice",
        time: null,
        title: i.sender_name ? `${i.sender_name} – ${i.subject}` : i.subject,
        area: i.area,
        detailLabel: formatAmount(i.amount),
        raw: i,
      }));

    const eventEntries = events.map((e) => ({
      key: `event-${e.id}`,
      type: "event",
      time: e.allDay ? null : new Date(e.start),
      title: e.title,
      area: e.area,
      detailLabel: e.allDay ? "Ganztägig" : `${formatTime(new Date(e.start))} – ${formatTime(new Date(e.end))}`,
      raw: e,
    }));

    // Einträge ohne feste Uhrzeit (Aufgaben, Rechnungen, ganztägige Termine)
    // zuerst, alphabetisch - danach zeitgebundene Termine chronologisch.
    // Eine einzige Zeitleiste statt getrennter Abschnitte pro Objekttyp.
    const untimed = [...taskEntries, ...invoiceEntries, ...eventEntries.filter((e) => !e.time)].sort((a, b) =>
      a.title.localeCompare(b.title, "de"),
    );
    const timed = eventEntries.filter((e) => e.time).sort((a, b) => a.time - b.time);

    setEntries([...untimed, ...timed]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = entries.find((e) => e.key === selectedKey) || null;

  function openEntry(key) {
    setSelectedKey(key);
    setPanelState("opening");
    // Erst im nächsten Frame in den Zielzustand wechseln, damit der Browser
    // die Startposition (translateX(12px), Opacity 0) tatsächlich rendert,
    // bevor die Transition zur Zielposition beginnt - sonst startet und
    // endet alles im selben Frame und man sieht keine Bewegung.
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tageslinie"
        description="Vorschau: Aufgaben, Termine und fällige Rechnungen von heute in einer Zeitleiste (Punkt 57/58 der Design-Erweiterung). Ersetzt die Übersicht noch nicht."
      />

      <div className="flex items-start gap-6">
        <div className={`min-w-0 flex-1 ${panelMounted ? "hidden lg:block" : ""}`}>
          {loading && <p className="text-sm text-ivory/65">Lädt…</p>}
          {error && <p className="text-sm text-status-hoch">{error}</p>}
          {!loading && !error && entries.length === 0 && (
            <EmptyState
              title="Nichts für heute"
              description="Keine Aufgaben, Termine oder fälligen Rechnungen für heute gefunden."
            />
          )}
          {!loading && entries.length > 0 && (
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
                          {entry.time ? formatTime(entry.time) : "Ohne Uhrzeit"} · {TYPE_LABEL[entry.type]}
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

        {panelMounted && selected && (
          <div
            className="w-full shrink-0 lg:sticky lg:top-4 lg:w-96"
            style={{
              transition: `transform ${panelAtTarget ? "220ms" : "160ms"} cubic-bezier(0.32,0.72,0,1), opacity ${
                panelAtTarget ? "220ms" : "160ms"
              } cubic-bezier(0.32,0.72,0,1)`,
              transform: panelAtTarget ? "translateX(0)" : "translateX(12px)",
              opacity: panelAtTarget ? 1 : 0,
            }}
          >
            <div className="overlay-panel space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-ivory/65">{TYPE_LABEL[selected.type]}</p>
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

              <Button variant="ghost" className="w-full" onClick={() => navigate(TYPE_PATH[selected.type])}>
                In {selected.type === "task" ? "Aufgaben" : selected.type === "event" ? "Kalender" : "Finanzen"} öffnen
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
