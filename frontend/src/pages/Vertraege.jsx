import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Label } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { useAreas } from "../context/AreasContext";

const EMPTY_FORM = {
  title: "",
  provider: "",
  area: "",
  cost: "",
  billing_cycle: "monatlich",
  cancellation_period_days: "",
  next_renewal_date: "",
  status: "aktiv",
  notes: "",
};

const CYCLE_LABELS = { monatlich: "monatlich", jaehrlich: "jährlich", einmalig: "einmalig", sonstig: "sonstig" };
const STATUS_LABELS = { aktiv: "Aktiv", gekuendigt: "Gekündigt", abgelaufen: "Abgelaufen" };

function formatAmount(value) {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function cancellationDeadline(contract) {
  if (!contract.next_renewal_date || contract.cancellation_period_days === null) return null;
  const deadline = new Date(contract.next_renewal_date);
  deadline.setDate(deadline.getDate() - contract.cancellation_period_days);
  return deadline;
}

function daysUntil(date) {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function Vertraege() {
  const { activeAreas } = useAreas();
  const [contracts, setContracts] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ area: areaFilter, status: statusFilter });
    setContracts(await apiFetch(`/contracts?${params}`));
  }, [areaFilter, statusFilter]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  function openNewForm() {
    const defaultArea = activeAreas.find((a) => a.is_default) || activeAreas[0];
    setForm({ ...EMPTY_FORM, area: defaultArea?.id || "" });
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(c) {
    setEditingId(c.id);
    setForm({
      title: c.title,
      provider: c.provider || "",
      area: c.area,
      cost: c.cost ?? "",
      billing_cycle: c.billing_cycle,
      cancellation_period_days: c.cancellation_period_days ?? "",
      next_renewal_date: c.next_renewal_date || "",
      status: c.status,
      notes: c.notes || "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await apiFetch(`/contracts/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/contracts", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteContract(id) {
    setError("");
    try {
      await apiFetch(`/contracts/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const soonToCancel = contracts.filter((c) => {
    if (c.status !== "aktiv") return false;
    const deadline = cancellationDeadline(c);
    if (!deadline) return false;
    const days = daysUntil(deadline);
    return days <= 30;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ivory">Verträge &amp; Abos</h1>
        <p className="mt-1 text-sm text-ivory/50">
          Übersicht über laufende Verträge und Abos inkl. Kündigungsfristen. Warnungen erscheinen hier in der App
          – es gibt noch keine Push-Benachrichtigung bei geschlossener App.
        </p>
      </div>

      {soonToCancel.length > 0 && (
        <GlassCard className="border border-status-hoch/30 bg-status-hoch/5">
          <p className="text-sm font-medium text-status-hoch">
            {soonToCancel.length} Vertrag/Verträge mit bald ablaufender Kündigungsfrist:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ivory/80">
            {soonToCancel.map((c) => {
              const deadline = cancellationDeadline(c);
              const days = daysUntil(deadline);
              return (
                <li key={c.id}>
                  {c.title} – Kündigungsfrist endet {days < 0 ? "seit" : "in"}{" "}
                  {Math.abs(days)} Tag(en) ({deadline.toLocaleDateString("de-DE")})
                </li>
              );
            })}
          </ul>
        </GlassCard>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[{ id: "alle", label: "Alle" }, ...activeAreas].map((a) => (
            <button
              key={a.id}
              onClick={() => setAreaFilter(a.id)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                areaFilter === a.id
                  ? "border-white/20 bg-white/10 text-ivory"
                  : "border-white/10 bg-white/[0.03] text-ivory/55 hover:bg-white/[0.06]"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-auto">
            <option value="alle">Alle Status</option>
            {Object.entries(STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Vertrag"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-status-hoch">{error}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Titel</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <Label>Anbieter</Label>
              <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            </div>
            <div>
              <Label>Kosten (EUR)</Label>
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </div>
            <div>
              <Label>Abrechnungszyklus</Label>
              <Select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
                {Object.entries(CYCLE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Nächste Verlängerung/Fälligkeit</Label>
              <Input
                type="date"
                value={form.next_renewal_date}
                onChange={(e) => setForm({ ...form, next_renewal_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Kündigungsfrist (Tage vorher)</Label>
              <Input
                type="number"
                value={form.cancellation_period_days}
                onChange={(e) => setForm({ ...form, cancellation_period_days: e.target.value })}
              />
            </div>
            <div>
              <Label>Bereich</Label>
              <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Notizen</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{editingId ? "Speichern" : "Anlegen"}</Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="space-y-3">
        {contracts.length === 0 && (
          <p className="py-8 text-center text-sm text-ivory/40">Keine Verträge in diesem Bereich.</p>
        )}
        {contracts.map((c) => (
          <GlassCard key={c.id} className="flex items-start gap-3 !p-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ivory">{c.title}</p>
              {c.provider && <p className="mt-0.5 text-sm text-ivory/55">{c.provider}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AreaBadge area={c.area} />
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/55">{STATUS_LABELS[c.status]}</span>
                <span className="text-xs font-medium text-ivory/90">
                  {formatAmount(c.cost)} / {CYCLE_LABELS[c.billing_cycle]}
                </span>
                {c.next_renewal_date && (
                  <span className="text-xs text-ivory/55">
                    Verlängerung {new Date(c.next_renewal_date).toLocaleDateString("de-DE")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(c)}>
                Bearbeiten
              </Button>
              <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => deleteContract(c.id)}>
                Löschen
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
