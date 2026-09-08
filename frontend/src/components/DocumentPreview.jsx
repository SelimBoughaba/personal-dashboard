import { useEffect, useState } from "react";
import { getToken } from "../api/client";

// Sichere Vorschau (Punkt 72): das <img>/<embed> zeigt nie direkt auf die
// API-URL (die Authentifizierung läuft über einen Bearer-Header, keinen
// Cookie - eine URL im src-Attribut würde ohne Header ohnehin nur 401
// liefern). Stattdessen wird die Vorschau authentifiziert per fetch()
// geladen und als Blob-URL eingebunden, derselbe Ansatz wie schon beim
// CSV-/Backup-Download.
export function DocumentPreview({ documentId }) {
  const [state, setState] = useState({ status: "loading", url: null, contentType: null });

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setState({ status: "loading", url: null, contentType: null });

    fetch(`/api/documents/${documentId}/preview`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(async (res) => {
        if (!res.ok) {
          if (cancelled) return;
          setState({ status: res.status === 415 ? "unsupported" : "error", url: null, contentType: null });
          return;
        }
        const contentType = res.headers.get("content-type");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", url: objectUrl, contentType });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", url: null, contentType: null });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  if (state.status === "loading") return <p className="text-xs text-ivory/55">Vorschau lädt…</p>;
  if (state.status === "unsupported") return <p className="text-xs text-ivory/55">Für diesen Dateityp gibt es keine Vorschau.</p>;
  if (state.status === "error") return <p className="text-xs text-ivory/55">Vorschau konnte nicht geladen werden.</p>;

  if (state.contentType === "application/pdf") {
    return (
      <embed
        src={state.url}
        type="application/pdf"
        className="h-80 w-full rounded-control border border-white/10 bg-white/[0.02]"
      />
    );
  }
  return (
    <img
      src={state.url}
      alt="Dokumentvorschau"
      className="max-h-80 w-full rounded-control border border-white/10 object-contain"
    />
  );
}
