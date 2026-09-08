import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAsyncAction } from "../hooks/useAsyncAction";

// Kontextlinks zwischen verwandten Objekten (Punkt 69, Teilumfang): Nutzer
// verknüpfen selbst, nichts wird automatisch abgeleitet oder vermutet -
// "Beziehungen sichtbar und manuell korrigierbar", kein volles
// Vorgangs-/Projektmodell mit Rollen/Sprints.
const TYPE_LABEL = {
  aufgabe: "Aufgabe",
  rechnung: "Rechnung",
  dokument: "Dokument",
  vertrag: "Vertrag",
  ziel: "Ziel",
  notiz: "Notiz",
  vorgang: "Vorgang",
};
const TYPE_PATH = {
  aufgabe: "/aufgaben",
  rechnung: "/finanzen",
  dokument: "/dokumente",
  vertrag: "/vertraege",
  ziel: "/ziele",
  notiz: "/notizen",
  vorgang: "/vorgaenge",
};
const LINKABLE_TYPES = Object.keys(TYPE_LABEL);

export function RelatedObjects({ type, id }) {
  const navigate = useNavigate();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const { run, isPending, error } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/links?${new URLSearchParams({ type, id })}`);
      setLinks(data);
    } finally {
      setLoading(false);
    }
  }, [type, id]);

  useEffect(() => {
    load();
  }, [load]);

  // Kein Suchindex-Neubau hier - die vorhandene /search-Route (dieselbe wie
  // die Befehlspalette) liefert schon eine typübergreifende, betitelte
  // Trefferliste; hier nur auf verlinkbare Typen filtern und bereits
  // Verknüpftes sowie das Objekt selbst ausschließen.
  useEffect(() => {
    if (!pickerOpen || !query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const data = await apiFetch(`/search?${new URLSearchParams({ q: query })}`);
        const linkedKeys = new Set(links.map((l) => `${l.type}-${l.id}`));
        setResults(
          data.filter(
            (r) => LINKABLE_TYPES.includes(r.type) && !(r.type === type && r.id === id) && !linkedKeys.has(`${r.type}-${r.id}`),
          ),
        );
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, pickerOpen, links, type, id]);

  async function addLink(target) {
    await run(`add-${target.type}-${target.id}`, async () => {
      await apiFetch("/links", {
        method: "POST",
        body: JSON.stringify({ a_type: type, a_id: id, b_type: target.type, b_id: target.id }),
      });
      setPickerOpen(false);
      setQuery("");
      await load();
    });
  }

  async function removeLink(linkId) {
    await run(`remove-${linkId}`, async () => {
      await apiFetch(`/links/${linkId}`, { method: "DELETE" });
      await load();
    });
  }

  if (loading) return null;

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wide text-ivory/55">Verknüpfte Objekte</h3>
        <button type="button" onClick={() => setPickerOpen((v) => !v)} className="text-xs text-ivory/65 underline hover:text-ivory">
          + Verknüpfen
        </button>
      </div>

      {links.length === 0 && !pickerOpen && <p className="text-xs text-ivory/55">Noch keine Verknüpfungen.</p>}

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li
              key={l.linkId}
              className="flex items-center justify-between gap-2 rounded-control border border-white/10 bg-white/[0.02] px-2.5 py-1.5"
            >
              <button type="button" onClick={() => navigate(TYPE_PATH[l.type])} className="min-w-0 flex-1 text-left">
                <span className="text-xs text-ivory/55">{TYPE_LABEL[l.type]}</span>
                <p className="truncate text-sm text-ivory/85">{l.title}</p>
              </button>
              <button
                type="button"
                onClick={() => removeLink(l.linkId)}
                disabled={isPending(`remove-${l.linkId}`)}
                aria-label={`Verknüpfung zu „${l.title}“ entfernen`}
                className="shrink-0 text-ivory/55 hover:text-status-hoch disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className="space-y-1.5 rounded-control border border-white/10 bg-white/[0.02] p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aufgabe, Rechnung, Dokument, Vertrag, Ziel, Notiz oder Vorgang suchen…"
            className="w-full rounded-control border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-ivory placeholder:text-muted focus:border-accent/40 focus:outline-none"
          />
          {searching && <p className="px-1 text-xs text-ivory/55">Suche…</p>}
          {!searching && query.trim() && results.length === 0 && <p className="px-1 text-xs text-ivory/55">Nichts gefunden.</p>}
          {results.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {results.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    type="button"
                    onClick={() => addLink(r)}
                    disabled={isPending(`add-${r.type}-${r.id}`)}
                    className="block w-full rounded-control px-2 py-1.5 text-left text-sm hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    <span className="text-xs text-ivory/55">{TYPE_LABEL[r.type]}</span>
                    <p className="truncate text-ivory/85">{r.title}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-xs text-status-hoch">{error}</p>}
    </div>
  );
}
