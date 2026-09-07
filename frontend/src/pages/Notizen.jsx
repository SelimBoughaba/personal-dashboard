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

const EMPTY_FORM = { title: "", content: "", area: "", tags: "" };

export function Notizen() {
  const { activeAreas } = useAreas();
  const [notes, setNotes] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const { run, isPending, error: actionError } = useAsyncAction();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (areaFilter !== "alle") params.set("area", areaFilter);
    if (query.trim()) params.set("q", query.trim());
    setNotes(await apiFetch(`/notes?${params}`));
  }, [areaFilter, query]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  function openNewForm() {
    const defaultArea = activeAreas.find((a) => a.is_default) || activeAreas[0];
    setForm({ ...EMPTY_FORM, area: defaultArea?.id || "" });
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(n) {
    setEditingId(n.id);
    setForm({ title: n.title, content: n.content, area: n.area, tags: n.tags.join(", ") });
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
    const payload = {
      title: form.title,
      content: form.content,
      area: form.area,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    await run("submit", async () => {
      if (editingId) {
        await apiFetch(`/notes/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/notes", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await load();
    });
  }

  async function togglePin(note) {
    await run(`pin-${note.id}`, async () => {
      await apiFetch(`/notes/${note.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !note.pinned }) });
      await load();
    });
  }

  async function deleteNote(id) {
    if (!window.confirm("Diese Notiz wirklich löschen?")) return;
    await run(`delete-${id}`, async () => {
      await apiFetch(`/notes/${id}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notizen" description="Angepinnte Notizen erscheinen zuerst." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips options={[{ id: "alle", label: "Alle" }, ...activeAreas]} value={areaFilter} onChange={setAreaFilter} />
        <div className="flex flex-wrap items-center gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titel oder Inhalt suchen…" className="!w-64" />
          <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Notiz"}
          </Button>
        </div>
      </div>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <FormField label="Titel" className="sm:col-span-2">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </FormField>
            <FormField label="Inhalt" className="sm:col-span-2">
              <Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
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
            <FormField label="Tags (mit Komma trennen)">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </FormField>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={isPending("submit")}>
                {isPending("submit") ? "Speichert…" : editingId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.length === 0 && (
          <EmptyState className="col-span-full" title="Keine Notizen gefunden" description="Über „+ Notiz“ deine erste Notiz anlegen." />
        )}
        {notes.map((n) => {
          const pinning = isPending(`pin-${n.id}`);
          const deleting = isPending(`delete-${n.id}`);
          return (
          <GlassCard key={n.id} className={`flex flex-col !p-4 ${deleting ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ivory">{n.title || "(ohne Titel)"}</p>
              <button
                onClick={() => togglePin(n)}
                disabled={pinning || deleting}
                title={n.pinned ? "Nicht mehr anpinnen" : "Anpinnen"}
                className={`shrink-0 text-lg disabled:opacity-40 ${n.pinned ? "text-accent" : "text-ivory/55 hover:text-ivory/70"}`}
              >
                {n.pinned ? "★" : "☆"}
              </button>
            </div>
            {n.content && <p className="mt-1 whitespace-pre-wrap text-sm text-ivory/65">{n.content}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AreaBadge area={n.area} />
              {n.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/55">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(n)} disabled={deleting}>
                Bearbeiten
              </Button>
              <Button
                variant="danger"
                className="!px-2 !py-1 text-xs"
                onClick={() => deleteNote(n.id)}
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
