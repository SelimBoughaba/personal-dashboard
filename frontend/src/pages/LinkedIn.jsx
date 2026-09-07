import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea, FormField } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { EmptyState } from "../components/ui/EmptyState";
import { useAreas } from "../context/AreasContext";
import { useAsyncAction } from "../hooks/useAsyncAction";

const EMPTY_FORM = { content: "", area: "", status: "entwurf", scheduled_date: "" };
const STATUS_LABELS = { entwurf: "Entwurf", geplant: "Geplant", veroeffentlicht: "Veröffentlicht" };

export function LinkedIn() {
  const { activeAreas } = useAreas();
  const [posts, setPosts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const { run, isPending, error: actionError } = useAsyncAction();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status: statusFilter });
    setPosts(await apiFetch(`/linkedin-posts?${params}`));
  }, [statusFilter]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  function openNewForm() {
    const defaultArea = activeAreas.find((a) => a.is_default) || activeAreas[0];
    setForm({ ...EMPTY_FORM, area: defaultArea?.id || "" });
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({ content: p.content, area: p.area, status: p.status, scheduled_date: p.scheduled_date || "" });
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
        await apiFetch(`/linkedin-posts/${editingId}`, { method: "PATCH", body: JSON.stringify(form) });
      } else {
        await apiFetch("/linkedin-posts", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load();
    });
  }

  async function deletePost(id) {
    if (!window.confirm("Diesen Beitrag wirklich löschen?")) return;
    await run(`delete-${id}`, async () => {
      await apiFetch(`/linkedin-posts/${id}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="LinkedIn-Beiträge"
        description={
          <>
            Beiträge entwerfen und zeitlich planen. <strong className="text-ivory/70">Wichtig:</strong> Es gibt keine
            Anbindung an die LinkedIn-API – nichts wird automatisch veröffentlicht. „Veröffentlicht" markierst du
            hier nur manuell, nachdem du den Beitrag selbst auf LinkedIn gepostet hast.
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          options={[{ id: "alle", label: "Alle" }, ...Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label }))]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
          {showForm ? "Abbrechen" : "+ Beitrag"}
        </Button>
      </div>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormField label="Text" className="sm:col-span-2">
              <Textarea rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
            </FormField>
            <FormField label="Geplantes Datum (optional)">
              <Input type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
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
            <FormField label="Status" className="sm:col-span-2">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </Select>
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
        {posts.length === 0 && <EmptyState title="Keine Beiträge vorhanden" description="Über „+ Beitrag“ deinen ersten Entwurf anlegen." />}
        {posts.map((p) => {
          const deleting = isPending(`delete-${p.id}`);
          return (
          <GlassCard key={p.id} className={`!p-4 ${deleting ? "opacity-50" : ""}`}>
            <p className="whitespace-pre-wrap text-sm text-ivory/85">{p.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AreaBadge area={p.area} />
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/55">{STATUS_LABELS[p.status]}</span>
              {p.scheduled_date && (
                <span className="text-xs text-ivory/55">
                  geplant für {new Date(p.scheduled_date).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>
            <div className="mt-3 flex gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(p)} disabled={deleting}>
                Bearbeiten
              </Button>
              <Button
                variant="danger"
                className="!px-2 !py-1 text-xs"
                onClick={() => deletePost(p.id)}
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
