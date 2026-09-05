import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { EmptyState } from "../components/ui/EmptyState";
import { useAreas } from "../context/AreasContext";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

export function Mail() {
  const { activeAreas } = useAreas();
  const [messages, setMessages] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/mail/messages");
      setMessages(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = areaFilter === "alle" ? messages : messages.filter((m) => m.area === areaFilter);

  return (
    <div className="space-y-4">
      <PageHeader title="E-Mail" description="Ungelesene und markierte Mails über alle eingerichteten Postfächer." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips options={[{ id: "alle", label: "Alle" }, ...activeAreas]} value={areaFilter} onChange={setAreaFilter} />
        <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={load}>
          Aktualisieren
        </Button>
      </div>

      {error && <GlassCard className="text-sm text-status-hoch">{error}</GlassCard>}
      {loading && !error && <p className="text-sm text-ivory/40">Lade Mails…</p>}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="Keine ungelesenen oder markierten Mails" description="In diesem Bereich gibt es aktuell nichts Neues." />
      )}

      <div className="space-y-2">
        {filtered.map((m) => (
          <GlassCard key={m.id} className="flex items-center gap-3 !p-4">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${m.unread ? "bg-lime" : "bg-white/10"}`}
              title={m.unread ? "Ungelesen" : "Gelesen"}
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${m.unread ? "font-semibold text-ivory" : "text-ivory/75"}`}>
                {m.fromName}
              </p>
              <p className={`truncate text-sm ${m.unread ? "text-ivory/75" : "text-ivory/40"}`}>{m.subject}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {m.flagged && (
                <span className="text-status-mittel" title="Markiert">
                  ★
                </span>
              )}
              <span className="text-xs text-ivory/40">{formatDate(m.date)}</span>
              <AreaBadge area={m.area} />
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
