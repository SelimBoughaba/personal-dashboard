import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { useAsyncAction } from "../hooks/useAsyncAction";

// Papierkorb (Punkt 77): "versehentlich Gelöschtes innerhalb einer
// erklärten Frist zurückholen". Löschen auf den acht Inhaltstypen setzt
// serverseitig nur noch deleted_at (siehe routes/trash.js) - diese Seite
// zeigt genau diese Einträge mit Wiederherstellen/Endgültig-löschen-
// Aktionen. Kein automatisches Leeren im Frontend - der Server räumt
// abgelaufene Einträge selbst bei jedem Abruf auf (siehe trash.js).

function formatRelative(iso) {
  const date = new Date(iso.replace(" ", "T") + "Z");
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "heute gelöscht";
  if (days === 1) return "vor 1 Tag gelöscht";
  return `vor ${days} Tagen gelöscht`;
}

function daysUntil(iso) {
  const date = new Date(iso.replace(" ", "T") + "Z");
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function Papierkorb() {
  const [items, setItems] = useState([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const { run, isPending, error } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/trash");
      setItems(result.items);
      setRetentionDays(result.retentionDays);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(item) {
    await run(`restore-${item.type}-${item.id}`, async () => {
      await apiFetch(`/trash/${item.type}/${item.id}/restore`, { method: "POST" });
      await load();
    });
  }

  async function purge(item) {
    if (!window.confirm(`„${item.title}" endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    await run(`purge-${item.type}-${item.id}`, async () => {
      await apiFetch(`/trash/${item.type}/${item.id}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Papierkorb"
        description={`Gelöschte Aufgaben, Rechnungen, Dokumente, Verträge, Ziele, Notizen, Prompts und LinkedIn-Beiträge bleiben ${retentionDays} Tage wiederherstellbar, danach werden sie automatisch endgültig entfernt.`}
      />

      {error && <p className="text-sm text-status-hoch">{error}</p>}
      {loading && <p className="text-sm text-ivory/65">Lädt…</p>}

      {!loading && items.length === 0 && (
        <EmptyState title="Papierkorb ist leer" description="Gelöschte Objekte erscheinen hier und lassen sich von hier aus wiederherstellen." />
      )}

      {items.length > 0 && (
        <GlassCard>
          <ul className="divide-y divide-white/5">
            {items.map((item) => (
              <li key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/65">{item.label}</span>
                    <span className="truncate text-sm text-ivory/90">{item.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ivory/55">
                    {formatRelative(item.deletedAt)} · noch {daysUntil(item.purgeAt)} Tag(e) wiederherstellbar
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => restore(item)}
                    disabled={isPending(`restore-${item.type}-${item.id}`)}
                  >
                    Wiederherstellen
                  </Button>
                  <Button
                    variant="danger"
                    className="!px-3 !py-1.5 text-xs"
                    onClick={() => purge(item)}
                    disabled={isPending(`purge-${item.type}-${item.id}`)}
                  >
                    Endgültig löschen
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  );
}
