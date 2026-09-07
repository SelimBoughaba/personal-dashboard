import { useEffect, useState, useCallback, useRef } from "react";
import { apiFetch, getToken } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { Button } from "../components/ui/Button";
import { Input, Select, Label, FormField } from "../components/ui/Field";
import { AreaBadge } from "../components/ui/AreaBadge";
import { PageHeader } from "../components/ui/PageHeader";
import { FilterChips } from "../components/ui/FilterChips";
import { EmptyState } from "../components/ui/EmptyState";
import { useAreas } from "../context/AreasContext";
import { useAsyncAction } from "../hooks/useAsyncAction";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Dokumente() {
  const { activeAreas } = useAreas();
  const [documents, setDocuments] = useState([]);
  const [areaFilter, setAreaFilter] = useState("alle");
  const [query, setQuery] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArea, setUploadArea] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", area: "", tags: "" });
  const fileInputRef = useRef(null);
  const { run, isPending, error: actionError } = useAsyncAction();

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (areaFilter !== "alle") params.set("area", areaFilter);
    if (query.trim()) params.set("q", query.trim());
    const list = await apiFetch(`/documents?${params}`);
    setDocuments(list);
  }, [areaFilter, query]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (!uploadArea && activeAreas.length > 0) {
      setUploadArea((activeAreas.find((a) => a.is_default) || activeAreas[0]).id);
    }
  }, [activeAreas, uploadArea]);

  async function handleUpload(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Bitte eine Datei auswählen.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("title", uploadTitle.trim() || file.name);
      body.append("area", uploadArea);
      body.append(
        "tags",
        JSON.stringify(
          uploadTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      );
      await apiFetch("/documents", { method: "POST", body });
      setUploadTitle("");
      setUploadTags("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    setError("");
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Download fehlgeschlagen.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(doc) {
    setEditingId(doc.id);
    setEditForm({ title: doc.title, area: doc.area, tags: doc.tags.join(", ") });
  }

  async function saveEdit(e) {
    e.preventDefault();
    setError("");
    await run("edit-save", async () => {
      await apiFetch(`/documents/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editForm.title,
          area: editForm.area,
          tags: editForm.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      setEditingId(null);
      await load();
    });
  }

  async function deleteDocument(id) {
    await run(`delete-${id}`, async () => {
      await apiFetch(`/documents/${id}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente"
        description="Dateien werden lokal auf dem Server abgelegt (Speicherort unter Einstellungen → Dokumente und Speicherort einstellbar), nicht in einer Cloud."
      />

      <GlassCard>
        <h2 className="mb-3 text-base font-semibold text-ivory">Dokument hochladen</h2>
        <form onSubmit={handleUpload} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Datei</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="block w-full text-sm text-ivory/70 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-ivory file:hover:bg-white/15"
            />
          </div>
          <FormField label="Titel (optional, sonst Dateiname)">
            <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="z. B. Mietvertrag 2026" />
          </FormField>
          <FormField label="Bereich">
            <Select value={uploadArea} onChange={(e) => setUploadArea(e.target.value)}>
              {activeAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Tags (mit Komma trennen)" className="sm:col-span-2">
            <Input value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} placeholder="z. B. Vertrag, Wohnung" />
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={uploading}>
              {uploading ? "Lädt hoch…" : "Hochladen"}
            </Button>
          </div>
        </form>
      </GlassCard>

      {(error || actionError) && <p className="text-sm text-status-hoch">{error || actionError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips options={[{ id: "alle", label: "Alle" }, ...activeAreas]} value={areaFilter} onChange={setAreaFilter} />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Titel oder Dateiname suchen…"
          className="!w-64"
        />
      </div>

      <div className="space-y-3">
        {documents.length === 0 && (
          <EmptyState title="Keine Dokumente gefunden" description="Datei oben hochladen oder Filter/Suche anpassen." />
        )}
        {documents.map((doc) =>
          editingId === doc.id ? (
            <GlassCard key={doc.id} className="!p-4">
              <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-3">
                <FormField label="Titel">
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                </FormField>
                <FormField label="Bereich">
                  <Select value={editForm.area} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}>
                    {activeAreas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Tags">
                  <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} />
                </FormField>
                <div className="flex gap-2 sm:col-span-3">
                  <Button type="submit" disabled={isPending("edit-save")}>
                    {isPending("edit-save") ? "Speichert…" : "Speichern"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    disabled={isPending("edit-save")}
                  >
                    Abbrechen
                  </Button>
                </div>
              </form>
            </GlassCard>
          ) : (
            (() => {
              const deleting = isPending(`delete-${doc.id}`);
              return (
              <GlassCard key={doc.id} className={`flex items-start gap-3 !p-4 ${deleting ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ivory">{doc.title}</p>
                  <p className="mt-0.5 truncate text-sm text-ivory/55">{doc.file_name}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <AreaBadge area={doc.area} />
                    <span className="text-xs text-ivory/45">{formatSize(doc.size)}</span>
                    <span className="text-xs text-ivory/45">
                      {new Date(doc.created_at).toLocaleDateString("de-DE")}
                    </span>
                    {doc.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/55">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => handleDownload(doc)}
                    disabled={deleting}
                  >
                    Herunterladen
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => startEdit(doc)}
                    disabled={deleting}
                  >
                    Bearbeiten
                  </Button>
                  <Button
                    variant="danger"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => deleteDocument(doc.id)}
                    disabled={deleting}
                  >
                    {deleting ? "Löscht…" : "Löschen"}
                  </Button>
                </div>
              </GlassCard>
              );
            })()
          ),
        )}
      </div>
    </div>
  );
}
