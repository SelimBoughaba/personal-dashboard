import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea, FormField } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { EmptyState } from "../components/ui/EmptyState";
import { RelatedObjects } from "../components/RelatedObjects";
import { DetailPanel } from "../components/DetailPanel";
import { useAreas } from "../context/AreasContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useDetailPanel } from "../hooks/useDetailPanel";

const EMPTY_FORM = { title: "", description: "", area: "", status: "aktiv" };

const STATUS_LABELS = { aktiv: "Aktiv", abgeschlossen: "Abgeschlossen" };

// Vorgang (Punkt 69, voller Umfang): ein Vorgang selbst trägt nur
// Titel/Beschreibung/Bereich/Status - das "Bündeln" von Aufgaben, Notizen,
// Dokumenten, Rechnungen, Verträgen und Zielen passiert unten über die
// bereits vorhandenen Kontextlinks (RelatedObjects), nicht über eine eigene
// Beziehungs-/Projektmanagement-Logik.
export function Vorgaenge() {
  const { activeAreas } = useAreas();
  const panel = useDetailPanel();
  const [vorgaenge, setVorgaenge] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const { run, isPending, error: actionError } = useAsyncAction();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ area: areaFilter, status: statusFilter });
    setVorgaenge(await apiFetch(`/vorgaenge?${params}`));
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

  function startEdit(v) {
    panel.reset();
    setEditingId(v.id);
    setForm({ title: v.title, description: v.description || "", area: v.area, status: v.status });
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
        await apiFetch(`/vorgaenge/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/vorgaenge", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load();
    });
  }

  async function deleteVorgang(id) {
    if (!window.confirm("Diesen Vorgang in den Papierkorb verschieben? Dort 30 Tage wiederherstellbar.")) return;
    await run(`delete-${id}`, async () => {
      await apiFetch(`/vorgaenge/${id}`, { method: "DELETE" });
      if (panel.selectedKey === id) panel.reset();
      await load();
    });
  }

  const selectedVorgang = vorgaenge.find((v) => v.id === panel.selectedKey) || null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vorgänge"
        description="Aufgaben, Notizen, Dokumente, Rechnungen, Verträge und Ziele unter einem benannten Vorgang bündeln – über gewöhnliche Verknüpfungen, ohne eigenes Projektmanagement mit Rollen oder Pflichtprozessen."
      />

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
            {showForm ? "Abbrechen" : "+ Vorgang"}
          </Button>
        </div>
      </div>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormField label="Titel" className="sm:col-span-2">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
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
            <FormField label="Beschreibung" className="sm:col-span-2">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending("submit")}>
                {isPending("submit") ? "Speichert…" : editingId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <div className={`min-w-0 flex-1 space-y-3 ${panel.mounted ? "hidden lg:block" : ""}`}>
          {vorgaenge.length === 0 && (
            <EmptyState title="Keine Vorgänge in diesem Bereich" description={'Über „+ Vorgang" deinen ersten Vorgang anlegen.'} />
          )}
          {vorgaenge.map((v) => {
            const deleting = isPending(`delete-${v.id}`);
            return (
              <GlassCard
                key={v.id}
                className={`flex items-start gap-3 !p-4 ${deleting ? "opacity-50" : ""} ${panel.selectedKey === v.id ? "border-accent/40" : ""}`}
              >
                <button type="button" onClick={() => panel.open(v.id)} className="min-w-0 flex-1 text-left">
                  <p className="font-bold text-ivory">{v.title}</p>
                  {v.description && <p className="mt-0.5 truncate text-sm text-ivory/55">{v.description}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AreaBadge area={v.area} />
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/55">{STATUS_LABELS[v.status]}</span>
                  </div>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(v)} disabled={deleting}>
                    Bearbeiten
                  </Button>
                  <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => deleteVorgang(v.id)} disabled={deleting}>
                    {deleting ? "Löscht…" : "Löschen"}
                  </Button>
                </div>
              </GlassCard>
            );
          })}
        </div>

        <DetailPanel
          mounted={panel.mounted}
          atTarget={panel.atTarget}
          onClose={panel.close}
          eyebrow="Vorgang"
          title={selectedVorgang ? selectedVorgang.title : ""}
        >
          {selectedVorgang && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <AreaBadge area={selectedVorgang.area} />
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/55">{STATUS_LABELS[selectedVorgang.status]}</span>
              </div>
              {selectedVorgang.description && (
                <p className="whitespace-pre-wrap text-sm text-ivory/80">{selectedVorgang.description}</p>
              )}

              <RelatedObjects type="vorgang" id={selectedVorgang.id} />

              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => startEdit(selectedVorgang)}>
                  Bearbeiten
                </Button>
                <Button
                  variant="danger"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => deleteVorgang(selectedVorgang.id)}
                  disabled={isPending(`delete-${selectedVorgang.id}`)}
                >
                  Löschen
                </Button>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </div>
  );
}
