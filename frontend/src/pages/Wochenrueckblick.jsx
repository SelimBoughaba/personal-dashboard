import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { localIsoDate } from "../utils/date";

// Wochenrückblick und Wochenvorbereitung (Punkt 68): Belege statt
// motivationaler KI-Erzählung - reine Zählungen/Kurztitel aus den echten
// Daten, keine generierte Zusammenfassung. Verschieben/Abbrechen nutzen
// bewusst die bestehenden /tasks-Routen statt eigener Endpunkte.
//
// Die API liefert zwei unterschiedliche Formen zurück (siehe
// backend/routes/weekReviews.js): eine noch offene Woche live mit vollen
// Objekten (Aktionen möglich), eine bereits abgeschlossene Woche als
// datensparsamer Snapshot (nur Zahlen + Kurztitel, keine IDs - Aktionen
// deshalb bewusst nicht mehr möglich). normalizeWeek() bringt beide Formen
// auf dieselbe Anzeige-Form, damit die Komponente unten nicht an jeder
// Stelle zwischen den beiden unterscheiden muss.
function normalizeWeek(data) {
  if (data.closed) {
    return {
      closed: true,
      closedAt: data.closedAt,
      completedCount: data.completedCount,
      completedTitles: data.completedTitles,
      leftover: null, // keine IDs im Snapshot -> keine Aktionen
      leftoverCount: data.leftoverCount,
      leftoverTitles: data.leftoverTitles,
      upcomingCount: data.upcomingDeadlineCount,
      upcomingDeadlines: null,
      eventCount: data.eventCount,
      eventError: null,
    };
  }
  return {
    closed: false,
    closedAt: null,
    completedCount: data.completed.length,
    completedTitles: data.completed.map((t) => t.title),
    leftover: data.leftover,
    leftoverCount: data.leftover.length,
    leftoverTitles: null,
    upcomingCount: data.upcomingDeadlines.length,
    upcomingDeadlines: data.upcomingDeadlines,
    eventCount: data.events.count,
    eventError: data.events.error,
  };
}

function mondayOf(dateIso) {
  const d = new Date(`${dateIso}T00:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return localIsoDate(d);
}

function addDaysIso(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
}

const TYPE_LABEL = { aufgabe: "Aufgabe", rechnung: "Rechnung", vertrag: "Vertrag" };
const TYPE_PATH = { aufgabe: "/aufgaben", rechnung: "/finanzen", vertrag: "/vertraege" };

export function Wochenrueckblick() {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => mondayOf(localIsoDate()));
  const [week, setWeek] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [postponeId, setPostponeId] = useState(null);
  const [postponeDate, setPostponeDate] = useState("");
  const { run, isPending, error: actionError } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch(`/week-reviews/${weekStart}`);
      setWeek(normalizeWeek(result));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiFetch("/week-reviews")
      .then(setHistory)
      .catch(() => {});
  }, [week?.closed]);

  async function closeWeek() {
    await run("close", async () => {
      const result = await apiFetch(`/week-reviews/${weekStart}/close`, { method: "POST" });
      setWeek(normalizeWeek(result));
    });
  }

  async function postpone(taskId) {
    if (!postponeDate) return;
    await run(`postpone-${taskId}`, async () => {
      await apiFetch(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ due_date: postponeDate }) });
      setPostponeId(null);
      setPostponeDate("");
      await load();
    });
  }

  async function cancelTask(taskId) {
    if (!window.confirm("Diese Aufgabe abbrechen und in den Papierkorb verschieben? Dort 30 Tage wiederherstellbar.")) return;
    await run(`cancel-${taskId}`, async () => {
      await apiFetch(`/tasks/${taskId}`, { method: "DELETE" });
      await load();
    });
  }

  const weekEnd = addDaysIso(weekStart, 6);
  const isCurrentWeek = weekStart === mondayOf(localIsoDate());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wochenrückblick"
        description="Erledigte Arbeit, liegengebliebene Aufgaben, kommende Fristen und bekannte Zeitbelegung - als Belege, nicht als Erzählung."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
            aria-label="Vorherige Woche"
            className="flex h-9 w-9 items-center justify-center rounded-control border border-white/10 text-ivory/70 hover:bg-white/[0.06]"
          >
            ←
          </button>
          <span className="text-sm font-bold text-ivory">
            {formatDate(weekStart)} – {formatDate(weekEnd)}
          </span>
          <button
            type="button"
            onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
            aria-label="Nächste Woche"
            className="flex h-9 w-9 items-center justify-center rounded-control border border-white/10 text-ivory/70 hover:bg-white/[0.06]"
          >
            →
          </button>
          {!isCurrentWeek && (
            <Button variant="ghost" className="text-xs" onClick={() => setWeekStart(mondayOf(localIsoDate()))}>
              Diese Woche
            </Button>
          )}
        </div>
        {week && !week.closed && (
          <Button onClick={closeWeek} disabled={isPending("close")}>
            {isPending("close") ? "Schließt…" : "Rückblick abschließen"}
          </Button>
        )}
      </div>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}
      {loading && <p className="text-sm text-ivory/65">Lädt…</p>}

      {week?.closed && (
        <GlassCard className="!py-3 text-sm text-ivory/70">
          Abgeschlossen am {new Date(week.closedAt).toLocaleDateString("de-DE")} – gespeicherter Snapshot, Aktionen
          nicht mehr möglich.
        </GlassCard>
      )}

      {week && (
        <div className="grid gap-4 md:grid-cols-2">
          <GlassCard>
            <h2 className="mb-3 text-sm font-bold text-ivory">
              Erledigte Arbeit
              <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/65">{week.completedCount}</span>
            </h2>
            {week.completedTitles.length === 0 ? (
              <p className="text-sm text-ivory/65">Nichts erledigt in dieser Woche.</p>
            ) : (
              <ul className="space-y-1.5">
                {week.completedTitles.map((title, i) => (
                  <li key={i} className="truncate text-sm text-ivory/85">
                    ✓ {title}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 text-sm font-bold text-ivory">
              Liegengebliebene Aufgaben
              <span className="ml-2 rounded-full bg-status-hoch/10 px-2 py-0.5 text-xs text-status-hoch">{week.leftoverCount}</span>
            </h2>
            {week.leftoverCount === 0 ? (
              <p className="text-sm text-ivory/65">Nichts liegengeblieben.</p>
            ) : week.leftover === null ? (
              <ul className="space-y-1.5">
                {week.leftoverTitles.map((title, i) => (
                  <li key={i} className="truncate text-sm text-ivory/85">
                    {title}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2">
                {week.leftover.map((t) => (
                  <li key={t.id} className="rounded-control border border-white/10 bg-white/[0.02] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ivory/85">{t.title}</span>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => {
                            setPostponeId(postponeId === t.id ? null : t.id);
                            setPostponeDate(t.due_date || "");
                          }}
                        >
                          Verschieben
                        </Button>
                        <Button
                          variant="danger"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => cancelTask(t.id)}
                          disabled={isPending(`cancel-${t.id}`)}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                    {postponeId === t.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          type="date"
                          value={postponeDate}
                          onChange={(e) => setPostponeDate(e.target.value)}
                          className="!py-1.5 text-sm"
                        />
                        <Button className="!px-3 !py-1.5 text-xs" onClick={() => postpone(t.id)} disabled={isPending(`postpone-${t.id}`)}>
                          Speichern
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 text-sm font-bold text-ivory">
              Kommende Fristen
              <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/65">{week.upcomingCount}</span>
            </h2>
            {week.upcomingCount === 0 ? (
              <p className="text-sm text-ivory/65">Keine Fristen in der Folgewoche bekannt.</p>
            ) : week.upcomingDeadlines === null ? (
              <p className="text-sm text-ivory/65">{week.upcomingCount} Frist(en) in der Folgewoche (Details nur bei offenem Rückblick).</p>
            ) : (
              <ul className="space-y-1.5">
                {week.upcomingDeadlines.map((d) => (
                  <li key={`${d.type}-${d.id}`}>
                    <button
                      type="button"
                      onClick={() => navigate(TYPE_PATH[d.type])}
                      className="flex w-full items-center justify-between gap-2 rounded-control px-1.5 py-1 text-left hover:bg-white/[0.04]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-ivory/85">{d.title}</span>
                      <span className="shrink-0 text-xs text-ivory/55">
                        {TYPE_LABEL[d.type]} · {formatDate(d.date)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard>
            <h2 className="mb-3 text-sm font-bold text-ivory">Bekannte Zeitbelegung</h2>
            {week.eventError && <p className="text-sm text-status-hoch">{week.eventError}</p>}
            {!week.eventError && week.eventCount === null && <p className="text-sm text-ivory/65">Kalender ist nicht konfiguriert.</p>}
            {!week.eventError && typeof week.eventCount === "number" && (
              <p className="text-sm text-ivory/85">{week.eventCount} Termin(e) in dieser Woche.</p>
            )}
          </GlassCard>
        </div>
      )}

      {history.length > 0 && (
        <GlassCard>
          <h2 className="mb-3 text-sm font-bold text-ivory">Verlauf abgeschlossener Rückblicke</h2>
          <div className="flex flex-wrap gap-2">
            {history.map((h) => (
              <button
                key={h.weekStart}
                type="button"
                onClick={() => setWeekStart(h.weekStart)}
                className={`rounded-control border px-3 py-1.5 text-xs ${
                  h.weekStart === weekStart
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-white/10 bg-white/[0.02] text-ivory/70 hover:bg-white/[0.05]"
                }`}
              >
                {formatDate(h.weekStart)}
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {!loading && !week && (
        <EmptyState title="Kein Rückblick verfügbar" description="Für diese Woche liegen keine Daten vor." />
      )}
    </div>
  );
}
