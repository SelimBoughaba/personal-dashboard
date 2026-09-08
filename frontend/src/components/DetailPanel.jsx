// Vorgangsakte-Grundgerüst (Punkt 58): "Ein ausgewähltes Objekt zeigt
// Titel, Status, nächste Aktion, verknüpfte Unterlagen und Verlauf. Auf
// breiten Fenstern seitlich, bei Platzmangel als vollständige
// Detailansicht." Der Inhalt (was genau angezeigt wird) bleibt Sache der
// aufrufenden Seite - dieses Gerüst liefert nur Rahmen, Öffnen-/
// Schließen-Übergang und die feste Kopfzeile (Eyebrow/Titel/Schließen).
export function DetailPanel({ mounted, atTarget, onClose, eyebrow, title, children }) {
  if (!mounted) return null;
  return (
    <div
      className="w-full shrink-0 lg:sticky lg:top-4 lg:w-96"
      style={{
        transition: `transform ${atTarget ? "220ms" : "160ms"} cubic-bezier(0.32,0.72,0,1), opacity ${
          atTarget ? "220ms" : "160ms"
        } cubic-bezier(0.32,0.72,0,1)`,
        transform: atTarget ? "translateX(0)" : "translateX(12px)",
        opacity: atTarget ? 1 : 0,
      }}
    >
      <div className="overlay-panel space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs text-ivory/65">{eyebrow}</p>}
            <h2 className="mt-0.5 truncate text-lg font-bold text-ivory">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Details schließen"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ivory/65 hover:bg-white/[0.06] hover:text-ivory"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Gemeinsame Marker-Grammatik für Ereignisfolgen/Fristmarkierungen (Punkt
// 57): derselbe Punkt-auf-Linie-Stil wie die Tageslinie in Uebersicht.jsx,
// hier als eigenständige, wiederverwendbare Liste - für eine Rechnung
// ("eingegangen -> geprüft -> bezahlt") ebenso wie für eine Vertragsfrist
// (Verlängerung, Kündigungsfrist). `steps` sind bereits in der Reihenfolge,
// in der sie erscheinen sollen; ein Schritt ohne `date` wird nicht
// gerendert - "darf nur tatsächlich gespeicherte Schritte zeigen"
// (Punkt 57), keine erfundenen/geschätzten Platzhalter.
export function EventSequence({ steps }) {
  const known = steps.filter((s) => s.date);
  if (known.length === 0) return null;
  return (
    <ol className="relative space-y-3 border-l border-white/10 pl-5">
      {known.map((s) => (
        <li key={s.label} className="relative">
          <span className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full border-2 border-forest-950 bg-accent" aria-hidden="true" />
          <p className="text-sm text-ivory/90">{s.label}</p>
          <p className="text-xs text-ivory/55">{s.date}</p>
        </li>
      ))}
    </ol>
  );
}
