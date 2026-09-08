import { useNavigate } from "react-router-dom";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { useNotifications } from "../hooks/useNotifications";

// Benachrichtigungszentrum (Punkt 76): Fristen, abgeschlossene
// Hintergrundvorgänge (aktuell: Mail-Scan-Ergebnis) und handlungsrelevante
// Integrationsfehler (Kalender-/Mail-Verbindung) an einer Stelle, mit
// Gelesen/Erledigt/Verschoben getrennt. "Nicht bloß einen funktionierenden
// Browser-Permissionsschalter mit zuverlässigen Mac-Erinnerungen
// gleichsetzen": der Freigabe-Status wird deshalb unten ehrlich als reiner
// Browser-Berechtigungsstatus benannt, nicht als Zusicherung.

const CATEGORY_LABEL = { deadline: "Fristen", background: "Hintergrundaufgaben", integration_error: "Integrationsfehler" };
const CATEGORY_ORDER = ["integration_error", "deadline", "background"];

function formatDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "long" });
}

function NotificationRow({ item, onOpen, onRead, onDone, onSnooze, pending }) {
  return (
    <li className={`rounded-control border border-white/10 bg-white/[0.02] p-3 ${item.read ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          disabled={!item.path}
          onClick={() => item.path && onOpen(item)}
          className={`min-w-0 flex-1 text-left ${item.path ? "hover:underline" : "cursor-default"}`}
        >
          <span className="block text-sm text-ivory/90">{item.title}</span>
          {item.category === "deadline" && (
            <span className={`text-xs ${item.overdue ? "text-status-hoch" : "text-ivory/55"}`}>
              {item.overdue ? "Überfällig seit" : "Fällig am"} {formatDate(item.date)}
            </span>
          )}
          {item.body && <span className="block text-xs text-ivory/55">{item.body}</span>}
        </button>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {!item.read && (
            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onRead(item.key)} disabled={pending(`read-${item.key}`)}>
              Gelesen
            </Button>
          )}
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onSnooze(item.key)} disabled={pending(`snooze-${item.key}`)}>
            Verschieben
          </Button>
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => onDone(item.key)} disabled={pending(item.key)}>
            Erledigt
          </Button>
        </div>
      </div>
    </li>
  );
}

function QuietHoursSettings({ quietHours, onSave }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3 text-sm text-ivory/85">
        <input
          type="checkbox"
          checked={quietHours.enabled}
          onChange={(e) => onSave({ ...quietHours, enabled: e.target.checked })}
          className="h-4 w-4 rounded accent-accent"
        />
        Ruhezeiten (keine nativen Mitteilungen)
      </label>
      {quietHours.enabled && (
        <div className="ml-7 flex items-center gap-2 text-sm text-ivory/70">
          <input
            type="time"
            value={quietHours.start}
            onChange={(e) => onSave({ ...quietHours, start: e.target.value })}
            className="rounded-control border border-white/10 bg-white/[0.04] px-2 py-1 text-sm text-ivory"
          />
          <span>bis</span>
          <input
            type="time"
            value={quietHours.end}
            onChange={(e) => onSave({ ...quietHours, end: e.target.value })}
            className="rounded-control border border-white/10 bg-white/[0.04] px-2 py-1 text-sm text-ivory"
          />
        </div>
      )}
    </div>
  );
}

function SettingsPanel(n) {
  return (
    <GlassCard className="space-y-4">
      <h2 className="text-sm font-bold text-ivory">Einstellungen</h2>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ivory/50">Kategorien anzeigen</p>
        <div className="flex flex-wrap gap-4">
          {CATEGORY_ORDER.map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm text-ivory/85">
              <input
                type="checkbox"
                checked={n.categories[cat] !== false}
                onChange={(e) => n.saveCategories({ ...n.categories, [cat]: e.target.checked })}
                className="h-4 w-4 rounded accent-accent"
              />
              {CATEGORY_LABEL[cat]}
            </label>
          ))}
        </div>
      </div>

      <QuietHoursSettings quietHours={n.quietHours} onSave={n.saveQuietHours} />

      <div className="border-t border-white/10 pt-3">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ivory/50">Native Mitteilungen</p>
        {n.permission === "unsupported" && <p className="text-sm text-ivory/55">Dieser Browser unterstützt keine nativen Mitteilungen.</p>}
        {n.permission === "denied" && (
          <p className="text-sm text-ivory/55">
            Im Browser blockiert. Das ist eine reine Browser-Berechtigung, keine zuverlässige Zusicherung wie bei
            nativen Mac-Erinnerungen - sie gilt nur, solange diese Seite in einem Tab geöffnet ist.
          </p>
        )}
        {n.permission === "default" && (
          <Button variant="ghost" className="text-xs" onClick={n.requestNativePermission}>
            Native Mitteilungen erlauben
          </Button>
        )}
        {n.permission === "granted" && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ivory/85">
              <input
                type="checkbox"
                checked={n.nativeEnabled}
                onChange={(e) => (e.target.checked ? n.requestNativePermission() : n.disableNative())}
                className="h-4 w-4 rounded accent-accent"
              />
              Aktiv (Berechtigung erteilt, gilt nur bei geöffnetem Tab)
            </label>
          </div>
        )}
        {(n.permission === "granted" || n.permission === "default") && (
          <label className="mt-2 flex items-center gap-2 text-sm text-ivory/85">
            <input
              type="checkbox"
              checked={n.showSensitivePreviews}
              onChange={(e) => n.saveShowSensitivePreviews(e.target.checked)}
              className="h-4 w-4 rounded accent-accent"
            />
            Vorschautexte anzeigen (Titel statt nur Anzahl - Standard: verborgen)
          </label>
        )}
      </div>
    </GlassCard>
  );
}

export function Benachrichtigungen() {
  const navigate = useNavigate();
  const n = useNotifications();

  const visible = n.items.filter((item) => n.categories[item.category] !== false);
  const grouped = CATEGORY_ORDER.map((cat) => ({ cat, items: visible.filter((i) => i.category === cat) })).filter(
    (g) => g.items.length > 0,
  );

  function snoozeQuick(key) {
    const days = window.prompt("Um wie viele Tage verschieben?", "1");
    if (!days) return;
    const n2 = parseInt(days, 10);
    if (!Number.isFinite(n2) || n2 <= 0) return;
    const d = new Date();
    d.setDate(d.getDate() + n2);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    n.snooze(key, iso);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Benachrichtigungen"
        description="Fristen, abgeschlossene Hintergrundaufgaben und Integrationsfehler an einer Stelle - gebündelt und dedupliziert, nicht als wachsendes Protokoll."
      />

      <SettingsPanel {...n} />

      {n.error && <p className="text-sm text-status-hoch">{n.error}</p>}
      {n.loading && <p className="text-sm text-ivory/65">Lädt…</p>}

      {!n.loading && grouped.length === 0 && (
        <EmptyState title="Keine offenen Benachrichtigungen" description="Alles gelesen, erledigt oder außerhalb der gewählten Kategorien." />
      )}

      {grouped.map(({ cat, items }) => (
        <GlassCard key={cat}>
          <h2 className="mb-3 text-sm font-bold text-ivory">
            {CATEGORY_LABEL[cat]}
            <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/65">{items.length}</span>
          </h2>
          <ul className="space-y-2">
            {items.map((item) => (
              <NotificationRow
                key={item.key}
                item={item}
                onOpen={(i) => navigate(i.path)}
                onRead={n.markRead}
                onDone={n.markDone}
                onSnooze={snoozeQuick}
                pending={n.isPending}
              />
            ))}
          </ul>
        </GlassCard>
      ))}
    </div>
  );
}
