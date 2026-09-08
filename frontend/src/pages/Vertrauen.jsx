import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  const units = ["Bytes", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("de-DE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatusDot({ tone }) {
  const color = { ok: "bg-status-niedrig", error: "bg-status-hoch", unknown: "bg-ivory/30" }[tone];
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

// Vertrauens- und Einrichtungsbereich (Punkt 80): "Eine verständliche Seite
// zeigt Speicherort, letzte verifizierte Sicherung, Integrationszustand,
// Datenfrische, aktive Berechtigungen und ausstehende lokale Jobs. [...]
// Keine grünen Sicherheitsversprechen ohne zugrundeliegende Prüfung." Jede
// hier angezeigte Angabe kommt direkt aus backend/src/trustStatus.js, das
// genau diese Begründung im Detail dokumentiert (z. B. warum Kalender live
// geprüft wird, Mail dagegen bewusst nicht).
export function Vertrauen() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await apiFetch("/trust-status"));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Vertrauen & Einrichtung"
          description="Speicherort, Sicherung, Integrationen, Datenfrische und Berechtigungen auf einen Blick – jede Angabe hier beruht auf einer echten Prüfung, kein reines Vertrauensversprechen."
        />
        <Button variant="ghost" onClick={load} disabled={loading}>
          {loading ? "Prüft…" : "Neu prüfen"}
        </Button>
      </div>

      {error && <p className="text-sm text-status-hoch">{error}</p>}

      {status && (
        <>
          <GlassCard className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ivory/65">Speicherort</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-ivory/55">Datenordner</p>
                <p className="break-all text-sm text-ivory/90">{status.storage.dataDir}</p>
                <p className="mt-0.5 text-xs text-ivory/55">Datenbank: {formatBytes(status.storage.databaseSizeBytes)}</p>
              </div>
              <div>
                <p className="text-xs text-ivory/55">Dokumentenordner</p>
                <p className="break-all text-sm text-ivory/90">{status.storage.documentsDir}</p>
                <p className="mt-0.5 text-xs text-ivory/55">Belegt: {formatBytes(status.storage.documentsSizeBytes)}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ivory/65">Letzte verifizierte Sicherung</h2>
            {status.backup.lastVerifiedAt ? (
              <p className="text-sm text-ivory/85">
                <StatusDot tone="ok" /> {formatDateTime(status.backup.lastVerifiedAt)}
              </p>
            ) : (
              <p className="text-sm text-ivory/65">
                <StatusDot tone="unknown" /> Noch keine verifizierte Sicherung – unter „Einstellungen" → „Backup" ein Backup
                herunterladen.
              </p>
            )}
            <p className="text-xs text-ivory/55">
              „Verifiziert" heißt: der zuletzt erzeugte Export wurde direkt im Anschluss durch dieselbe strenge Prüfung
              geschickt, die auch beim Wiederherstellen läuft – nicht nur, dass ein Download angestoßen wurde.
            </p>
          </GlassCard>

          <GlassCard className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ivory/65">Integrationszustand</h2>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3 rounded-control border border-white/10 bg-white/[0.02] p-3">
                <div>
                  <p className="text-sm font-bold text-ivory/90">Kalender (iCloud)</p>
                  {!status.integrations.calendar.configured && <p className="text-xs text-ivory/55">Nicht eingerichtet.</p>}
                  {status.integrations.calendar.configured && status.integrations.calendar.ok && (
                    <p className="text-xs text-ivory/65">Verbindung soeben erfolgreich geprüft.</p>
                  )}
                  {status.integrations.calendar.configured && !status.integrations.calendar.ok && (
                    <p className="text-xs text-status-hoch">{status.integrations.calendar.error}</p>
                  )}
                </div>
                <StatusDot
                  tone={
                    !status.integrations.calendar.configured ? "unknown" : status.integrations.calendar.ok ? "ok" : "error"
                  }
                />
              </div>
              {!status.integrations.mail.configured && (
                <div className="flex items-start justify-between gap-3 rounded-control border border-white/10 bg-white/[0.02] p-3">
                  <div>
                    <p className="text-sm font-bold text-ivory/90">E-Mail (IMAP)</p>
                    <p className="text-xs text-ivory/55">Kein Postfach eingerichtet.</p>
                  </div>
                  <StatusDot tone="unknown" />
                </div>
              )}
              {status.integrations.mail.configured &&
                status.integrations.mail.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-start justify-between gap-3 rounded-control border border-white/10 bg-white/[0.02] p-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-ivory/90">
                        E-Mail (IMAP) · {account.label}
                        {!account.active && " · pausiert"}
                      </p>
                      <p className="text-xs text-ivory/65">
                        {account.lastError
                          ? `Letzter bekannter Fehler: ${account.lastError}`
                          : "Kein bekannter Fehler aus dem letzten Scan-Versuch – kein Live-Test, um keinen ungefragten Postfach-Scan auszulösen."}
                      </p>
                    </div>
                    <StatusDot tone={account.lastError ? "error" : "unknown"} />
                  </div>
                ))}
            </div>
          </GlassCard>

          <GlassCard className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ivory/65">Aktive Berechtigungen</h2>
            <div className="flex items-center justify-between gap-3 rounded-control border border-white/10 bg-white/[0.02] p-3">
              <div>
                <p className="text-sm font-bold text-ivory/90">Browser-Benachrichtigungen</p>
                <p className="text-xs text-ivory/65">
                  {permission === "granted" && "Erlaubt."}
                  {permission === "denied" && "Abgelehnt."}
                  {permission === "default" && "Noch nicht angefragt."}
                  {permission === "unsupported" && "Von diesem Browser nicht unterstützt."}
                </p>
              </div>
              <StatusDot tone={permission === "granted" ? "ok" : permission === "denied" ? "error" : "unknown"} />
            </div>
          </GlassCard>

          <GlassCard className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ivory/65">Datenfrische</h2>
            <ul className="space-y-1">
              {status.dataFreshness.map((entry) => (
                <li key={entry.table} className="flex items-center justify-between gap-3 py-1 text-sm">
                  <span className="text-ivory/85">{entry.label}</span>
                  <span className="text-xs text-ivory/55">
                    {entry.count} {entry.count === 1 ? "Eintrag" : "Einträge"}
                    {entry.lastUpdatedAt ? ` · zuletzt geändert ${formatDateTime(entry.lastUpdatedAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ivory/65">Ausstehende lokale Jobs</h2>
            <p className="text-sm text-ivory/85">Keine.</p>
            <p className="text-xs text-ivory/55">{status.pendingJobs.note}</p>
          </GlassCard>
        </>
      )}
    </div>
  );
}
