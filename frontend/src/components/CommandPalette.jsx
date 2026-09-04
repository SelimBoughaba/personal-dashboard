import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";

const QUICK_LINKS = [
  { title: "Übersicht", path: "/" },
  { title: "Kalender", path: "/kalender" },
  { title: "Aufgaben", path: "/aufgaben" },
  { title: "Finanzen", path: "/finanzen" },
  { title: "Ziele", path: "/ziele" },
  { title: "Dokumente", path: "/dokumente" },
  { title: "Verträge & Abos", path: "/vertraege" },
  { title: "Notizen", path: "/notizen" },
  { title: "Gesundheit", path: "/gesundheit" },
  { title: "Einstellungen", path: "/einstellungen" },
];

export function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      apiFetch(`/search?q=${encodeURIComponent(query.trim())}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function go(path) {
    navigate(path);
    onClose();
  }

  const filteredQuickLinks = QUICK_LINKS.filter((l) => l.title.toLowerCase().includes(query.trim().toLowerCase()));
  const grouped = results.reduce((acc, r) => {
    (acc[r.typeLabel] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-24" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Suche"
        className="glass-panel w-full max-w-lg overflow-hidden rounded-brand"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen oder zu einer Seite springen…"
          className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm text-ivory placeholder:text-muted focus:outline-none"
        />
        <div className="max-h-96 overflow-y-auto p-2">
          {!query.trim() && (
            <div>
              <p className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wide text-ivory/35">Seiten</p>
              {QUICK_LINKS.map((l) => (
                <button
                  key={l.path}
                  onClick={() => go(l.path)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ivory/80 hover:bg-white/[0.06]"
                >
                  {l.title}
                </button>
              ))}
            </div>
          )}

          {query.trim() && filteredQuickLinks.length > 0 && (
            <div>
              <p className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wide text-ivory/35">Seiten</p>
              {filteredQuickLinks.map((l) => (
                <button
                  key={l.path}
                  onClick={() => go(l.path)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ivory/80 hover:bg-white/[0.06]"
                >
                  {l.title}
                </button>
              ))}
            </div>
          )}

          {query.trim() && loading && <p className="px-3 py-2 text-sm text-ivory/40">Suche…</p>}

          {query.trim() && !loading && Object.entries(grouped).map(([label, items]) => (
            <div key={label}>
              <p className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-ivory/35">{label}</p>
              {items.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => go(r.path)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/[0.06]"
                >
                  <span className="text-ivory/85">{r.title}</span>
                  {r.subtitle && <span className="ml-2 text-xs text-ivory/40">{r.subtitle}</span>}
                </button>
              ))}
            </div>
          ))}

          {query.trim() && !loading && results.length === 0 && filteredQuickLinks.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-ivory/40">Keine Treffer.</p>
          )}
        </div>
      </div>
    </div>
  );
}
