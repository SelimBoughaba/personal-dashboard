import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useSavedViews } from "../hooks/useSavedViews";

// "Ansicht speichern" (Punkt 75) - benennt die aktuelle URL (Pfad +
// Filter-Query) und pinnt sie in der Sidebar. Die Seite selbst muss ihre
// Filter dafür in die URL schreiben (siehe Tasks.jsx/Rechnungen.jsx), sonst
// gäbe es hier nichts Sinnvolles zu speichern.
export function SaveViewButton() {
  const location = useLocation();
  const { saveView } = useSavedViews();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const hasFilters = location.search.length > 1;

  async function handleSave(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await saveView({ label: label.trim(), path: location.pathname, search: location.search.replace(/^\?/, "") });
      setOpen(false);
      setLabel("");
    } finally {
      setSaving(false);
    }
  }

  if (!hasFilters) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-control border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-ivory/75 hover:bg-white/[0.06]"
      >
        Ansicht speichern
      </button>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex items-center gap-1.5">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Name der Ansicht…"
        className="w-40 rounded-control border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-ivory placeholder:text-muted focus:border-accent/40 focus:outline-none"
      />
      <button
        type="submit"
        disabled={saving || !label.trim()}
        className="rounded-control bg-accent px-2.5 py-2 text-xs font-bold text-ink disabled:opacity-50"
      >
        Speichern
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Abbrechen"
        className="rounded-control border border-white/10 px-2 py-2 text-xs text-ivory/65 hover:bg-white/[0.06]"
      >
        ×
      </button>
    </form>
  );
}
