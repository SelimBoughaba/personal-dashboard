import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Label, Textarea } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { useAreas } from "../context/AreasContext";

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
    try {
      if (editingId) {
        await apiFetch(`/notes/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/notes", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePin(note) {
    try {
      await apiFetch(`/notes/${note.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !note.pinned }) });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteNote(id) {
    setError("");
    try {
      await apiFetch(`/notes/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ivory">Notizen</h1>
        <p className="mt-1 text-sm text-ivory/50">Angepinnte Notizen erscheinen zuerst.</p>
      </div>

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
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titel oder Inhalt suchen…" className="!w-64" />
          <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
            {showForm ? "Abbrechen" : "+ Notiz"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-status-hoch">{error}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Titel</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Inhalt</Label>
              <Textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
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
              <Label>Tags (mit Komma trennen)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">{editingId ? "Speichern" : "Anlegen"}</Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {notes.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-ivory/40">Keine Notizen gefunden.</p>
        )}
        {notes.map((n) => (
          <GlassCard key={n.id} className="flex flex-col !p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ivory">{n.title || "(ohne Titel)"}</p>
              <button
                onClick={() => togglePin(n)}
                title={n.pinned ? "Nicht mehr anpinnen" : "Anpinnen"}
                className={`shrink-0 text-lg ${n.pinned ? "text-lime" : "text-ivory/25 hover:text-ivory/60"}`}
              >
                {n.pinned ? "★" : "☆"}
              </button>
            </div>
            {n.content && <p className="mt-1 whitespace-pre-wrap text-sm text-ivory/65">{n.content}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AreaBadge area={n.area} />
              {n.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/55">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(n)}>
                Bearbeiten
              </Button>
              <Button variant="danger" className="!px-2 !py-1 text-xs" onClick={() => deleteNote(n.id)}>
                Löschen
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
