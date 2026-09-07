import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, FormField } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { EmptyState } from "../components/ui/EmptyState";
import { localIsoDate } from "../utils/date";
import { useAsyncAction } from "../hooks/useAsyncAction";

const TYPE_LABELS = { gewicht: "Gewicht", schlaf: "Schlaf", sport: "Sport", sonstiges: "Sonstiges" };
const DEFAULT_UNITS = { gewicht: "kg", schlaf: "h", sport: "min", sonstiges: "" };

function todayIso() {
  return localIsoDate();
}

const EMPTY_FORM = { entry_date: todayIso(), type: "gewicht", value: "", unit: DEFAULT_UNITS.gewicht, note: "" };

export function Gesundheit() {
  const [entries, setEntries] = useState([]);
  const [typeFilter, setTypeFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const { run, isPending, error: actionError } = useAsyncAction();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (typeFilter !== "alle") params.set("type", typeFilter);
    setEntries(await apiFetch(`/health-entries?${params}`));
  }, [typeFilter]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  function openNewForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(e) {
    setEditingId(e.id);
    setForm({ entry_date: e.entry_date, type: e.type, value: e.value ?? "", unit: e.unit || "", note: e.note || "" });
    setShowForm(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  function changeType(type) {
    setForm((f) => ({ ...f, type, unit: DEFAULT_UNITS[type] }));
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError("");
    await run("submit", async () => {
      if (editingId) {
        await apiFetch(`/health-entries/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/health-entries", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load();
    });
  }

  async function deleteEntry(id) {
    if (!window.confirm("Diesen Eintrag wirklich löschen?")) return;
    await run(`delete-${id}`, async () => {
      await apiFetch(`/health-entries/${id}`, { method: "DELETE" });
      await load();
    });
  }

  // Trend gegenüber dem vorherigen Eintrag desselben Typs (Liste ist nach
  // Datum absteigend sortiert, daher ist der "vorherige" Eintrag zeitlich
  // der nächste in der Liste).
  function trendFor(entry, index) {
    if (entry.value === null) return null;
    const older = entries.slice(index + 1).find((e) => e.type === entry.type && e.value !== null);
    if (!older) return null;
    if (entry.value > older.value) return "↑";
    if (entry.value < older.value) return "↓";
    return "→";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gesundheit"
        description="Einfache manuelle Verlaufsaufzeichnung (Gewicht, Schlaf, Sport, Sonstiges). Keine Anbindung an Wearables/Health-Apps – Werte werden von Hand eingetragen."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          options={[{ id: "alle", label: "Alle" }, ...Object.entries(TYPE_LABELS).map(([id, label]) => ({ id, label }))]}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
          {showForm ? "Abbrechen" : "+ Eintrag"}
        </Button>
      </div>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormField label="Datum">
              <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
            </FormField>
            <FormField label="Typ">
              <Select value={form.type} onChange={(e) => changeType(e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Wert">
              <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </FormField>
            <FormField label="Einheit">
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </FormField>
            <FormField label="Notiz" className="sm:col-span-2">
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending("submit")}>
                {isPending("submit") ? "Speichert…" : editingId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="space-y-2">
        {entries.length === 0 && <EmptyState title="Keine Einträge vorhanden" description="Über „+ Eintrag“ deinen ersten Wert erfassen." />}
        {entries.map((e, i) => {
          const deleting = isPending(`delete-${e.id}`);
          return (
          <GlassCard key={e.id} className={`flex items-center gap-3 !p-3 ${deleting ? "opacity-50" : ""}`}>
            <span className="w-24 shrink-0 text-xs text-ivory/55">{new Date(e.entry_date).toLocaleDateString("de-DE")}</span>
            <span className="w-20 shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-center text-[10px] text-ivory/70">
              {TYPE_LABELS[e.type]}
            </span>
            <span className="flex-1 text-sm text-ivory/90">
              {e.value !== null ? `${e.value} ${e.unit}`.trim() : "–"}
              {trendFor(e, i) && <span className="ml-2 text-ivory/50">{trendFor(e, i)}</span>}
              {e.note && <span className="ml-2 text-ivory/50">· {e.note}</span>}
            </span>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(e)} disabled={deleting}>
                Bearbeiten
              </Button>
              <Button
                variant="danger"
                className="!px-2 !py-1 text-xs"
                onClick={() => deleteEntry(e.id)}
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
