import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Textarea, FormField } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { EmptyState } from "../components/ui/EmptyState";
import { useAsyncAction } from "../hooks/useAsyncAction";

const EMPTY_FORM = { title: "", content: "", tags: "" };

export function PromptBibliothek() {
  const [prompts, setPrompts] = useState([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const { run, isPending, error: actionError } = useAsyncAction();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    setPrompts(await apiFetch(`/prompts?${params}`));
  }, [query]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  function openNewForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({ title: p.title, content: p.content, tags: p.tags.join(", ") });
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
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    await run("submit", async () => {
      if (editingId) {
        await apiFetch(`/prompts/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/prompts", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await load();
    });
  }

  async function togglePin(prompt) {
    await run(`pin-${prompt.id}`, async () => {
      await apiFetch(`/prompts/${prompt.id}`, { method: "PATCH", body: JSON.stringify({ pinned: !prompt.pinned }) });
      await load();
    });
  }

  async function deletePrompt(id) {
    if (!window.confirm("Diesen Prompt in den Papierkorb verschieben? Dort 30 Tage wiederherstellbar.")) return;
    await run(`delete-${id}`, async () => {
      await apiFetch(`/prompts/${id}`, { method: "DELETE" });
      await load();
    });
  }

  async function copyPrompt(prompt) {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopiedId(prompt.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("Kopieren in die Zwischenablage nicht möglich (Browser-Berechtigung fehlt?).");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prompt-Bibliothek"
        description="Eigene Prompts sammeln, mit Tags ordnen und im Alltag per Klick in die Zwischenablage kopieren."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titel oder Inhalt suchen…" className="!w-64" />
        <Button onClick={() => (showForm ? resetForm() : openNewForm())} variant={showForm ? "ghost" : "primary"}>
          {showForm ? "Abbrechen" : "+ Prompt"}
        </Button>
      </div>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      {showForm && (
        <GlassCard>
          <form onSubmit={handleSubmit} className="grid gap-3">
            <FormField label="Titel">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </FormField>
            <FormField label="Prompt-Text">
              <Textarea rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
            </FormField>
            <FormField label="Tags (mit Komma trennen)">
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="z. B. E-Mail, Zusammenfassung" />
            </FormField>
            <div>
              <Button type="submit" disabled={isPending("submit")}>
                {isPending("submit") ? "Speichert…" : editingId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prompts.length === 0 && (
          <EmptyState className="col-span-full" title="Keine Prompts gefunden" description="Über „+ Prompt“ deinen ersten Prompt speichern." />
        )}
        {prompts.map((p) => {
          const pinning = isPending(`pin-${p.id}`);
          const deleting = isPending(`delete-${p.id}`);
          return (
          <GlassCard key={p.id} className={`flex flex-col !p-4 ${deleting ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-ivory">{p.title}</p>
              <button
                onClick={() => togglePin(p)}
                disabled={pinning || deleting}
                title={p.pinned ? "Nicht mehr anpinnen" : "Anpinnen"}
                className={`shrink-0 text-lg disabled:opacity-40 ${p.pinned ? "text-accent" : "text-ivory/55 hover:text-ivory/70"}`}
              >
                {p.pinned ? "★" : "☆"}
              </button>
            </div>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-ivory/65">{p.content}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-ivory/55">
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => copyPrompt(p)} disabled={deleting}>
                {copiedId === p.id ? "Kopiert!" : "Kopieren"}
              </Button>
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => startEdit(p)} disabled={deleting}>
                Bearbeiten
              </Button>
              <Button
                variant="danger"
                className="!px-2 !py-1 text-xs"
                onClick={() => deletePrompt(p.id)}
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
