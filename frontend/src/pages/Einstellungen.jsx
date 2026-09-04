import { useState, useEffect, useRef } from "react";
import { apiFetch, getToken } from "../api/client";
import { useAreas } from "../context/AreasContext";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Label } from "../components/ui/Field";

const SECTIONS = [
  { id: "profil", label: "Profil" },
  { id: "darstellung", label: "Darstellung" },
  { id: "bereiche", label: "Lebensbereiche" },
  { id: "dashboard", label: "Dashboard" },
  { id: "kalender", label: "Kalender" },
  { id: "email", label: "E-Mail" },
  { id: "dokumente", label: "Dokumente" },
  { id: "benachrichtigungen", label: "Benachrichtigungen" },
  { id: "datenschutz", label: "Datenschutz & Sicherheit" },
  { id: "import-export", label: "Import & Export" },
  { id: "sicherung", label: "Sicherung & Wiederherstellung" },
];

function SavedHint({ show }) {
  if (!show) return null;
  return <span className="ml-3 text-xs text-ivory/50">Gespeichert.</span>;
}

// ---------------- Profil ----------------

export function ProfilSection() {
  const [name, setName] = useState("");
  const [salutation, setSalutation] = useState("du");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/settings").then((s) => {
      setName(s["profile.name"] || "");
      setSalutation(s["profile.salutation"] || "du");
      setLoading(false);
    });
  }, []);

  async function persist(overrides = {}) {
    const nextName = overrides.name ?? name;
    const nextSalutation = overrides.salutation ?? salutation;
    await apiFetch("/settings/profile.name", { method: "PUT", body: JSON.stringify({ value: nextName }) });
    await apiFetch("/settings/profile.salutation", { method: "PUT", body: JSON.stringify({ value: nextSalutation }) });
  }

  async function save(e) {
    e.preventDefault();
    await persist();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <p className="text-sm text-ivory/40">Lädt…</p>;

  return (
    <GlassCard>
      <h2 className="mb-4 text-base font-semibold text-ivory">Profil</h2>
      <form onSubmit={save} className="max-w-sm space-y-4">
        <div>
          <Label>Name</Label>
          {/* onBlur speichert automatisch, damit im Einrichtungsassistenten
              nichts verloren geht, auch ohne expliziten Klick auf "Speichern". */}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => persist({ name: e.target.value })}
            placeholder="Dein Name"
          />
        </div>
        <div>
          <Label>Anrede</Label>
          <Select
            value={salutation}
            onChange={(e) => {
              setSalutation(e.target.value);
              persist({ salutation: e.target.value });
            }}
          >
            <option value="du">Du</option>
            <option value="sie">Sie</option>
          </Select>
        </div>
        <div>
          <Button type="submit">Speichern</Button>
          <SavedHint show={saved} />
        </div>
      </form>
    </GlassCard>
  );
}

// ---------------- Darstellung ----------------

function DarstellungSection() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/settings").then((s) => {
      setReducedMotion(!!s["appearance.reduced_motion"]);
      setLoading(false);
    });
  }, []);

  async function toggle(value) {
    setReducedMotion(value);
    await apiFetch("/settings/appearance.reduced_motion", { method: "PUT", body: JSON.stringify({ value }) });
    document.documentElement.classList.toggle("reduce-motion", value);
  }

  if (loading) return <p className="text-sm text-ivory/40">Lädt…</p>;

  return (
    <GlassCard>
      <h2 className="mb-1 text-base font-semibold text-ivory">Darstellung</h2>
      <p className="mb-4 text-sm text-ivory/50">
        Das Design (Manrope, Waldgrün/Ivory, Liquid Glass) ist bewusst einheitlich vorgegeben. Hier lässt sich nur
        die Bewegung reduzieren.
      </p>
      <label className="flex items-center gap-3 text-sm text-ivory/85">
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 rounded accent-lime"
        />
        Bewegung reduzieren (weniger Animationen)
      </label>
    </GlassCard>
  );
}

// ---------------- Lebensbereiche ----------------

const PALETTE = ["#e8b866", "#c8ff52", "#7fb69e", "#94a08f", "#e2725b", "#d9a441", "#8ba888", "#b7a1e0"];

function slugify(label) {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function BereicheSection() {
  const { areas, reload } = useAreas();
  const [error, setError] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [reassignFor, setReassignFor] = useState(null);
  const [reassignTarget, setReassignTarget] = useState("");

  async function addArea(e) {
    e.preventDefault();
    setError("");
    const id = slugify(newLabel);
    if (!id) {
      setError("Bitte einen Namen eingeben.");
      return;
    }
    try {
      await apiFetch("/areas", { method: "POST", body: JSON.stringify({ id, label: newLabel.trim(), color: newColor }) });
      setNewLabel("");
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateArea(id, patch) {
    await apiFetch(`/areas/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await reload();
  }

  async function move(id, direction) {
    const order = areas.map((a) => a.id);
    const idx = order.indexOf(id);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= order.length) return;
    [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
    await apiFetch("/areas/reorder", { method: "POST", body: JSON.stringify({ order }) });
    await reload();
  }

  async function tryDelete(area) {
    setError("");
    try {
      await apiFetch(`/areas/${area.id}`, { method: "DELETE", body: JSON.stringify({}) });
      await reload();
    } catch (err) {
      if (err.needsReassignment) {
        setReassignFor({ ...area, taskCount: err.taskCount, invoiceCount: err.invoiceCount });
        setReassignTarget(areas.find((a) => a.id !== area.id)?.id || "");
      } else {
        setError(err.message);
      }
    }
  }

  async function confirmReassignDelete() {
    if (!reassignFor || !reassignTarget) return;
    try {
      await apiFetch(`/areas/${reassignFor.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reassign_to: reassignTarget }),
      });
      setReassignFor(null);
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="mb-4 text-base font-semibold text-ivory">Lebensbereiche</h2>
        <div className="space-y-2">
          {areas.map((area, idx) => (
            <div key={area.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <input
                type="color"
                value={area.color}
                onChange={(e) => updateArea(area.id, { color: e.target.value })}
                className="h-8 w-8 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                title="Farbe"
              />
              <Input
                value={area.label}
                onChange={(e) => updateArea(area.id, { label: e.target.value })}
                className="!w-auto flex-1"
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-ivory/60">
                <input
                  type="radio"
                  name="default-area"
                  checked={!!area.is_default}
                  onChange={() => updateArea(area.id, { is_default: true })}
                  className="accent-lime"
                />
                Standard
              </label>
              <button
                onClick={() => updateArea(area.id, { archived: !area.archived })}
                className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-xs text-ivory/55 hover:bg-white/[0.05]"
              >
                {area.archived ? "Reaktivieren" : "Archivieren"}
              </button>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => move(area.id, -1)}
                  disabled={idx === 0}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-ivory/55 hover:bg-white/[0.05] disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(area.id, 1)}
                  disabled={idx === areas.length - 1}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-ivory/55 hover:bg-white/[0.05] disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => tryDelete(area)}>
                Löschen
              </Button>
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-status-hoch">{error}</p>}

        <form onSubmit={addArea} className="mt-5 flex flex-wrap items-end gap-3 border-t border-white/5 pt-4">
          <div className="flex-1">
            <Label>Neuer Bereich</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="z. B. Familie" />
          </div>
          <div className="flex gap-1.5">
            {PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setNewColor(c)}
                style={{ background: c }}
                className={`h-7 w-7 rounded-full border-2 ${newColor === c ? "border-lime" : "border-transparent"}`}
                aria-label={`Farbe ${c}`}
              />
            ))}
          </div>
          <Button type="submit">Hinzufügen</Button>
        </form>
      </GlassCard>

      {reassignFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-sm">
            <h3 className="mb-2 text-base font-semibold text-ivory">„{reassignFor.label}“ löschen</h3>
            <p className="mb-4 text-sm text-ivory/60">
              Diesem Bereich sind noch {reassignFor.taskCount} Aufgabe(n) und {reassignFor.invoiceCount} Rechnung(en)
              zugeordnet. Wohin sollen sie verschoben werden?
            </p>
            <Select value={reassignTarget} onChange={(e) => setReassignTarget(e.target.value)} className="mb-4">
              {areas
                .filter((a) => a.id !== reassignFor.id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setReassignFor(null)}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={confirmReassignDelete}>
                Verschieben &amp; löschen
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

// ---------------- Dashboard ----------------

const WIDGET_DEFS = [
  { id: "termine", label: "Heutige Termine" },
  { id: "aufgaben", label: "Wichtigste Aufgaben" },
  { id: "rechnungen", label: "Offene Rechnungen" },
  { id: "mails", label: "Wichtige E-Mails" },
];

function DashboardSection() {
  const [order, setOrder] = useState(WIDGET_DEFS.map((w) => w.id));
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/settings").then((s) => {
      const cfg = s["dashboard.widgets"];
      if (cfg?.order?.length) setOrder(cfg.order);
      if (cfg?.hidden) setHidden(cfg.hidden);
      setLoading(false);
    });
  }, []);

  async function persist(nextOrder, nextHidden) {
    await apiFetch("/settings/dashboard.widgets", {
      method: "PUT",
      body: JSON.stringify({ value: { order: nextOrder, hidden: nextHidden } }),
    });
  }

  function toggleHidden(id) {
    const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
    setHidden(next);
    persist(order, next);
  }

  function move(id, direction) {
    const next = [...order];
    const idx = next.indexOf(id);
    const swapWith = idx + direction;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setOrder(next);
    persist(next, hidden);
  }

  if (loading) return <p className="text-sm text-ivory/40">Lädt…</p>;

  return (
    <GlassCard>
      <h2 className="mb-1 text-base font-semibold text-ivory">Dashboard-Module</h2>
      <p className="mb-4 text-sm text-ivory/50">
        Reihenfolge und Sichtbarkeit der Übersicht-Module. Änderungen wirken sofort auf der Übersicht.
      </p>
      <div className="space-y-2">
        {order.map((id, idx) => {
          const def = WIDGET_DEFS.find((w) => w.id === id);
          if (!def) return null;
          return (
            <div key={id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <label className="flex flex-1 items-center gap-2.5 text-sm text-ivory/85">
                <input
                  type="checkbox"
                  checked={!hidden.includes(id)}
                  onChange={() => toggleHidden(id)}
                  className="h-4 w-4 accent-lime"
                />
                {def.label}
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => move(id, -1)}
                  disabled={idx === 0}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-ivory/55 hover:bg-white/[0.05] disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(id, 1)}
                  disabled={idx === order.length - 1}
                  className="rounded-lg border border-white/10 px-2 py-1 text-xs text-ivory/55 hover:bg-white/[0.05] disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ---------------- Kalender ----------------

export function KalenderSection() {
  const { activeAreas } = useAreas();
  const [configured, setConfigured] = useState(false);
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [areaMap, setAreaMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/settings/calendar").then((data) => {
      setConfigured(data.configured);
      if (data.configured) {
        setUsername(data.username);
        setAreaMap(data.areaMap || {});
      }
      setLoading(false);
    });
  }, []);

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch("/settings/calendar/test", {
        method: "POST",
        body: JSON.stringify({ username, appPassword }),
      });
      setTestResult({ ok: true, names: result.calendarNames });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/settings/calendar", {
        method: "POST",
        body: JSON.stringify({ username, appPassword, areaMap }),
      });
      setConfigured(true);
      setAppPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function disconnect() {
    await apiFetch("/settings/calendar", { method: "DELETE" });
    setConfigured(false);
    setUsername("");
    setAppPassword("");
    setAreaMap({});
  }

  if (loading) return <p className="text-sm text-ivory/40">Lädt…</p>;

  return (
    <GlassCard>
      <h2 className="mb-1 text-base font-semibold text-ivory">Kalender (iCloud)</h2>
      <p className="mb-4 text-sm text-ivory/50">
        Verbindet dein Apple-Kalender-Konto per CalDAV. Ein App-spezifisches Passwort erzeugst du unter{" "}
        <span className="text-ivory/70">appleid.apple.com → Anmelden &amp; Sicherheit</span> – nicht dein normales
        Apple-ID-Passwort verwenden.
      </p>
      {configured && (
        <p className="mb-4 rounded-lg border border-lime/20 bg-lime/5 px-3 py-2 text-sm text-ivory/75">
          Verbunden als <strong className="text-ivory">{username}</strong>.
        </p>
      )}
      <form onSubmit={save} className="max-w-sm space-y-4">
        <div>
          <Label>Apple-ID</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="du@icloud.com" />
        </div>
        <div>
          <Label>App-spezifisches Passwort</Label>
          <Input
            type="password"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            placeholder={configured ? "•••• (unverändert lassen)" : "xxxx-xxxx-xxxx-xxxx"}
          />
        </div>

        {activeAreas.length > 0 && (
          <div>
            <Label>Kalendername je Bereich (optional)</Label>
            <div className="space-y-2">
              {activeAreas.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-ivory/55">{a.label}</span>
                  <Input
                    value={areaMap[a.label] || ""}
                    onChange={(e) => setAreaMap({ ...areaMap, [a.label]: e.target.value })}
                    placeholder="Kalendername in Apple Calendar"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {testResult && (
          <p className={`text-sm ${testResult.ok ? "text-ivory/75" : "text-status-hoch"}`}>
            {testResult.ok
              ? `Verbindung erfolgreich. Kalender: ${testResult.names.join(", ") || "keine gefunden"}.`
              : testResult.message}
          </p>
        )}
        {error && <p className="text-sm text-status-hoch">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={test} disabled={testing || !username || !appPassword}>
            {testing ? "Teste…" : "Verbindung testen"}
          </Button>
          <Button type="submit">Speichern</Button>
          <SavedHint show={saved} />
          {configured && (
            <Button type="button" variant="danger" onClick={disconnect}>
              Trennen
            </Button>
          )}
        </div>
      </form>
    </GlassCard>
  );
}

// ---------------- E-Mail ----------------

function MailAccountRow({ account, onChange, onRemove }) {
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [password, setPassword] = useState("");

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      await apiFetch("/settings/mail/test", {
        method: "POST",
        body: JSON.stringify({ host: account.host, port: account.port, user: account.user, password }),
      });
      setTestResult({ ok: true });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ivory">{account.label}</span>
        <span className="text-xs text-ivory/40">{account.user} · {account.host}</span>
        {account.paused && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/40">pausiert</span>}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => onChange({ paused: !account.paused })}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-ivory/55 hover:bg-white/[0.05]"
          >
            {account.paused ? "Fortsetzen" : "Pausieren"}
          </button>
          <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={onRemove}>
            Entfernen
          </Button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          type="password"
          placeholder="Passwort zum Testen eingeben"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="!w-56"
        />
        <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={test} disabled={testing || !password}>
          {testing ? "Teste…" : "Verbindung testen"}
        </Button>
        {testResult && (
          <span className={`text-xs ${testResult.ok ? "text-ivory/60" : "text-status-hoch"}`}>
            {testResult.ok ? "Verbindung erfolgreich." : testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

export function EmailSection() {
  const { activeAreas } = useAreas();
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newAccount, setNewAccount] = useState({ id: "", label: "", host: "", port: 993, user: "", password: "" });
  const [newRuleMatch, setNewRuleMatch] = useState("");
  const [newRuleArea, setNewRuleArea] = useState("");

  async function reload() {
    const [accs, settings] = await Promise.all([apiFetch("/settings/mail/accounts"), apiFetch("/settings")]);
    setAccounts(accs);
    setRules(settings["mail.area_rules"] || {});
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  async function addAccount(e) {
    e.preventDefault();
    setError("");
    if (!newAccount.id || !newAccount.host || !newAccount.user || !newAccount.password) {
      setError("Kennung, Host, Benutzername und Passwort sind erforderlich.");
      return;
    }
    try {
      await apiFetch("/settings/mail/accounts", { method: "POST", body: JSON.stringify(newAccount) });
      setNewAccount({ id: "", label: "", host: "", port: 993, user: "", password: "" });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateAccount(id, patch) {
    await apiFetch(`/settings/mail/accounts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    await reload();
  }

  async function removeAccount(id) {
    await apiFetch(`/settings/mail/accounts/${id}`, { method: "DELETE" });
    await reload();
  }

  async function saveRules(next) {
    setRules(next);
    await apiFetch("/settings/mail/area-rules", { method: "PUT", body: JSON.stringify({ rules: next }) });
  }

  function addRule() {
    if (!newRuleMatch.trim() || !newRuleArea) return;
    saveRules({ ...rules, [newRuleMatch.trim()]: newRuleArea });
    setNewRuleMatch("");
  }

  function removeRule(match) {
    const next = { ...rules };
    delete next[match];
    saveRules(next);
  }

  if (loading) return <p className="text-sm text-ivory/40">Lädt…</p>;

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="mb-1 text-base font-semibold text-ivory">E-Mail-Konten</h2>
        <p className="mb-4 text-sm text-ivory/50">
          Allgemeine IMAP-Konten (z. B. IONOS). Gmail über OAuth und ein rein lokaler Modus ohne Postfach sind
          ebenfalls möglich – Gmail-OAuth ist noch nicht angebunden (eigene Etappe), lokal ohne E-Mail funktioniert
          bereits, indem hier einfach kein Konto hinzugefügt wird.
        </p>
        <div className="space-y-2">
          {accounts.length === 0 && <p className="text-sm text-ivory/40">Noch kein Postfach verbunden.</p>}
          {accounts.map((a) => (
            <MailAccountRow
              key={a.id}
              account={a}
              onChange={(patch) => updateAccount(a.id, patch)}
              onRemove={() => removeAccount(a.id)}
            />
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-status-hoch">{error}</p>}

        <form onSubmit={addAccount} className="mt-5 grid gap-3 border-t border-white/5 pt-4 sm:grid-cols-2">
          <div>
            <Label>Kennung</Label>
            <Input value={newAccount.id} onChange={(e) => setNewAccount({ ...newAccount, id: e.target.value })} placeholder="ionos" />
          </div>
          <div>
            <Label>Anzeigename</Label>
            <Input value={newAccount.label} onChange={(e) => setNewAccount({ ...newAccount, label: e.target.value })} placeholder="IONOS" />
          </div>
          <div>
            <Label>IMAP-Host</Label>
            <Input value={newAccount.host} onChange={(e) => setNewAccount({ ...newAccount, host: e.target.value })} placeholder="imap.ionos.de" />
          </div>
          <div>
            <Label>Port</Label>
            <Input type="number" value={newAccount.port} onChange={(e) => setNewAccount({ ...newAccount, port: e.target.value })} />
          </div>
          <div>
            <Label>Benutzername</Label>
            <Input value={newAccount.user} onChange={(e) => setNewAccount({ ...newAccount, user: e.target.value })} placeholder="du@domain.de" />
          </div>
          <div>
            <Label>Passwort</Label>
            <Input type="password" value={newAccount.password} onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Postfach hinzufügen</Button>
          </div>
        </form>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-1 text-base font-semibold text-ivory">Bereichs-Zuordnung</h2>
        <p className="mb-4 text-sm text-ivory/50">
          Mails, deren Absenderadresse den Text enthält, werden automatisch dem gewählten Bereich zugeordnet.
        </p>
        <div className="mb-3 space-y-2">
          {Object.entries(rules).map(([match, area]) => (
            <div key={match} className="flex items-center gap-2 text-sm">
              <span className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-ivory/80">{match}</span>
              <span className="text-ivory/40">→</span>
              <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-ivory/80">
                {activeAreas.find((a) => a.id === area)?.label || area}
              </span>
              <button onClick={() => removeRule(match)} className="text-ivory/40 hover:text-status-hoch">
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newRuleMatch}
            onChange={(e) => setNewRuleMatch(e.target.value)}
            placeholder="z. B. kanzlei.de"
            className="!w-48"
          />
          <Select value={newRuleArea} onChange={(e) => setNewRuleArea(e.target.value)} className="!w-auto">
            <option value="">Bereich wählen</option>
            {activeAreas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
          <Button variant="ghost" onClick={addRule} disabled={!newRuleMatch.trim() || !newRuleArea}>
            Regel hinzufügen
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

// ---------------- Dokumente ----------------

export function DokumenteSection() {
  const [folder, setFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch("/settings").then((s) => {
      setFolder(s["documents.folder"] || "backend/data/documents");
      setLoading(false);
    });
  }, []);

  async function persist(value) {
    await apiFetch("/settings/documents.folder", { method: "PUT", body: JSON.stringify({ value: value ?? folder }) });
  }

  async function save(e) {
    e.preventDefault();
    await persist();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <p className="text-sm text-ivory/40">Lädt…</p>;

  return (
    <GlassCard>
      <h2 className="mb-1 text-base font-semibold text-ivory">Dokumente &amp; Speicherort</h2>
      <p className="mb-4 text-sm text-ivory/50">
        Ordner auf dem Mac (relativ zum Backend), in dem hochgeladene Dokumente abgelegt werden. Die eigentliche
        Dokumentenverwaltung (Ordner, Tags, Vorschau) ist als nächster Ausbauschritt geplant – dieser Speicherort ist
        bereits die Grundlage dafür.
      </p>
      <form onSubmit={save} className="flex max-w-md items-end gap-2">
        <div className="flex-1">
          <Label>Speicherordner</Label>
          <Input value={folder} onChange={(e) => setFolder(e.target.value)} onBlur={(e) => persist(e.target.value)} />
        </div>
        <Button type="submit">Speichern</Button>
      </form>
      <SavedHint show={saved} />
    </GlassCard>
  );
}

// ---------------- Benachrichtigungen ----------------

export function BenachrichtigungenSection() {
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/settings").then((s) => {
      setRemindersEnabled(s["notifications.reminders_enabled"] !== false);
      setLoading(false);
    });
  }, []);

  async function toggle(value) {
    setRemindersEnabled(value);
    await apiFetch("/settings/notifications.reminders_enabled", { method: "PUT", body: JSON.stringify({ value }) });
  }

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  if (loading) return <p className="text-sm text-ivory/40">Lädt…</p>;

  return (
    <GlassCard>
      <h2 className="mb-1 text-base font-semibold text-ivory">Benachrichtigungen</h2>
      <p className="mb-4 text-sm text-ivory/50">
        Erinnerungen erscheinen aktuell innerhalb der App (z. B. überfällige Aufgaben auf der Übersicht) – noch keine
        Push-Benachrichtigungen bei geschlossener App.
      </p>
      <label className="mb-4 flex items-center gap-3 text-sm text-ivory/85">
        <input
          type="checkbox"
          checked={remindersEnabled}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 accent-lime"
        />
        In-App-Erinnerungen anzeigen
      </label>
      <div className="border-t border-white/5 pt-4">
        <p className="mb-2 text-sm text-ivory/60">
          Browser-Benachrichtigungen: <strong className="text-ivory">{permission}</strong>
        </p>
        {permission !== "granted" && permission !== "unsupported" && (
          <Button variant="ghost" onClick={requestPermission}>
            Berechtigung anfragen
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

// ---------------- Datenschutz & Sicherheit ----------------

function DatenschutzSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Neue Passwörter stimmen nicht überein.");
      return;
    }
    try {
      await apiFetch("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="mb-1 text-base font-semibold text-ivory">Datenschutz</h2>
        <p className="text-sm text-ivory/60 leading-relaxed">
          Alle Daten (Aufgaben, Termine, Mails-Metadaten, Rechnungen, Zugangsdaten für Kalender/E-Mail) liegen
          ausschließlich lokal in einer SQLite-Datenbank auf diesem Mac – nichts wird an einen Cloud-Dienst
          übertragen, es gibt keine Telemetrie. Zugangsdaten für Kalender/E-Mail werden im Klartext in dieser
          lokalen Datenbank gespeichert (kein Zugriff auf den macOS-Schlüsselbund aus dem Browser möglich) – die
          Datei ist entsprechend nur so sicher wie der Zugriffsschutz auf diesen Mac.
        </p>
      </GlassCard>
      <GlassCard>
        <h2 className="mb-4 text-base font-semibold text-ivory">Passwort ändern</h2>
        <form onSubmit={changePassword} className="max-w-sm space-y-4">
          <div>
            <Label>Aktuelles Passwort</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <Label>Neues Passwort</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label>Neues Passwort bestätigen</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-status-hoch">{error}</p>}
          <div>
            <Button type="submit">Passwort ändern</Button>
            <SavedHint show={saved} />
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

// ---------------- Import & Export / Sicherung ----------------

async function downloadBackup() {
  const res = await fetch("/api/backup", { headers: { Authorization: `Bearer ${getToken()}` } });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportExportSection() {
  const fileInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState("");
  const [error, setError] = useState("");

  async function handleCsvImport(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const csv = await file.text();
      const result = await apiFetch("/invoices/import", { method: "POST", body: JSON.stringify({ csv }) });
      setImportMessage(`${result.imported} Rechnung(en) importiert, ${result.skipped.length} übersprungen.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <GlassCard>
      <h2 className="mb-1 text-base font-semibold text-ivory">Import &amp; Export</h2>
      <p className="mb-4 text-sm text-ivory/50">
        Finanzdaten als CSV importieren/exportieren (auch direkt im Bereich „Finanzen" verfügbar), oder alle Daten
        als JSON exportieren.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href="/api/invoices/export.csv" className="hidden" />
        <Button
          variant="ghost"
          onClick={async () => {
            const res = await fetch("/api/invoices/export.csv", { headers: { Authorization: `Bearer ${getToken()}` } });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "rechnungen.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Rechnungen als CSV exportieren
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
          Rechnungen aus CSV importieren
        </Button>
        <Button variant="ghost" onClick={downloadBackup}>
          Alle Daten als JSON exportieren
        </Button>
      </div>
      {importMessage && <p className="mt-3 text-sm text-ivory/70">{importMessage}</p>}
      {error && <p className="mt-3 text-sm text-status-hoch">{error}</p>}
    </GlassCard>
  );
}

function SicherungSection() {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setPreview(null);
    setDone(false);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await apiFetch("/backup/preview", { method: "POST", body: JSON.stringify({ data }) });
      setPreview(result);
      setPendingData(data);
    } catch (err) {
      setError(err.message || "Datei konnte nicht gelesen werden.");
    }
  }

  async function confirmRestore() {
    setError("");
    try {
      await apiFetch("/backup/restore", { method: "POST", body: JSON.stringify({ data: pendingData, confirm: true }) });
      setDone(true);
      setPreview(null);
      setPendingData(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <GlassCard>
        <h2 className="mb-1 text-base font-semibold text-ivory">Sicherung erstellen</h2>
        <p className="mb-4 text-sm text-ivory/50">
          Lädt eine vollständige Kopie aller lokalen Daten als Datei herunter – inklusive gespeicherter
          Kalender-/E-Mail-Zugangsdaten im Klartext. Bitte sicher aufbewahren.
        </p>
        <Button variant="ghost" onClick={downloadBackup}>
          Backup herunterladen
        </Button>
      </GlassCard>

      <GlassCard>
        <h2 className="mb-1 text-base font-semibold text-ivory">Wiederherstellen</h2>
        <p className="mb-4 text-sm text-ivory/50">
          <strong className="text-status-hoch">Achtung:</strong> Das Wiederherstellen ersetzt alle aktuellen lokalen
          Daten vollständig durch den Inhalt der Backup-Datei.
        </p>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
        <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
          Backup-Datei auswählen
        </Button>

        {error && <p className="mt-3 text-sm text-status-hoch">{error}</p>}
        {done && <p className="mt-3 text-sm text-ivory/70">Wiederherstellung abgeschlossen.</p>}

        {preview && (
          <div className="mt-4 rounded-xl border border-status-hoch/25 bg-status-hoch/5 p-4">
            <p className="mb-2 text-sm text-ivory/80">
              Backup vom {preview.exported_at ? new Date(preview.exported_at).toLocaleString("de-DE") : "unbekannt"}:{" "}
              {preview.counts.tasks} Aufgabe(n), {preview.counts.invoices} Rechnung(en), {preview.counts.areas}{" "}
              Bereich(e), {preview.counts.documents || 0} Dokument(e), {preview.counts.contracts || 0} Vertrag/Verträge,{" "}
              {preview.counts.goals || 0} Ziel(e), {preview.counts.notes || 0} Notiz(en),{" "}
              {preview.counts.health_entries || 0} Gesundheitseintrag/-einträge.
            </p>
            <p className="mb-3 text-sm text-status-hoch">
              Alle aktuellen Daten werden dabei unwiderruflich überschrieben.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setPreview(null); setPendingData(null); }}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={confirmRestore}>
                Jetzt überschreiben &amp; wiederherstellen
              </Button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ---------------- Hauptseite ----------------

export function Einstellungen() {
  const [active, setActive] = useState("profil");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ivory">Einstellungen</h1>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 ${
                active === s.id ? "bg-white/10 text-ivory" : "text-ivory/55 hover:bg-white/[0.04]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {active === "profil" && <ProfilSection />}
          {active === "darstellung" && <DarstellungSection />}
          {active === "bereiche" && <BereicheSection />}
          {active === "dashboard" && <DashboardSection />}
          {active === "kalender" && <KalenderSection />}
          {active === "email" && <EmailSection />}
          {active === "dokumente" && <DokumenteSection />}
          {active === "benachrichtigungen" && <BenachrichtigungenSection />}
          {active === "datenschutz" && <DatenschutzSection />}
          {active === "import-export" && <ImportExportSection />}
          {active === "sicherung" && <SicherungSection />}
        </div>
      </div>
    </div>
  );
}
