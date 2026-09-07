import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { EmptyState } from "../components/ui/EmptyState";
import { useAreas } from "../context/AreasContext";
import { useAsyncAction } from "../hooks/useAsyncAction";

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
  const { run, isPending, error: actionError } = useAsyncAction();

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
    await run("submit", async () => {
      if (editingId) {
        await apiFetch(`/contracts/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/contracts", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load();
    });
  }

  async function deleteContract(id) {
    if (!window.confirm("Diesen Vertrag wirklich löschen?")) return;
    await run(`delete-${id}`, async () => {
      await apiFetch(`/contracts/${id}`, { method: "DELETE" });
      await load();
    });
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
      <PageHeader
        title="Verträge & Abos"
        description="Übersicht über laufende Verträge und Abos inkl. Kündigungsfristen. Warnungen erscheinen hier in der App – es gibt noch keine Push-Benachrichtigung bei geschlossener App."
      />

      {soonToCancel.length > 0 && (
        <GlassCard className="border border-status-hoch/30 bg-status-hoch/5">
          <p className="text-sm font-bold text-status-hoch">
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
        <FilterChips options={[{ id: "alle", label: "Alle" }, ...activeAreas]} value={areaFilter} onChange={setAreaFilter} />
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

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormField label="Titel">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </FormField>
            <FormField label="Anbieter">
              <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            </FormField>
            <FormField label="Kosten (EUR)">
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            </FormField>
            <FormField label="Abrechnungszyklus">
              <Select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}>
                {Object.entries(CYCLE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Nächste Verlängerung/Fälligkeit">
              <Input
                type="date"
                value={form.next_renewal_date}
                onChange={(e) => setForm({ ...form, next_renewal_date: e.target.value })}
              />
            </FormField>
            <FormField label="Kündigungsfrist (Tage vorher)">
              <Input
                type="number"
                value={form.cancellation_period_days}
                onChange={(e) => setForm({ ...form, cancellation_period_days: e.target.value })}
              />
            </FormField>
            <FormField label="Bereich">
              <Select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                {activeAreas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Notizen" className="sm:col-span-2">
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending("submit")}>
                {isPending("submit") ? "Speichert…" : editingId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="space-y-3">
        {contracts.length === 0 && (
          <EmptyState title="Keine Verträge in diesem Bereich" description="Über „+ Vertrag“ deinen ersten Vertrag anlegen." />
        )}
        {contracts.map((c) => {
          const deleting = isPending(`delete-${c.id}`);
          return (
          <GlassCard key={c.id} className={`flex items-start gap-3 !p-4 ${deleting ? "opacity-50" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ivory">{c.title}</p>
              {c.provider && <p className="mt-0.5 text-sm text-ivory/55">{c.provider}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <AreaBadge area={c.area} />
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/55">{STATUS_LABELS[c.status]}</span>
                <span className="text-xs font-bold text-ivory/90">
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
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(c)} disabled={deleting}>
                Bearbeiten
              </Button>
              <Button
                variant="danger"
                className="!px-2 !py-1 text-xs"
                onClick={() => deleteContract(c.id)}
                disabled={deleting}
              >
                {deleting ? "Löscht…" : "Löschen"}
              </Button>
            </div>
          </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
