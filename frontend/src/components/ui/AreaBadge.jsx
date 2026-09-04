export const AREA_LABELS = {
  corelegal: "Corelegal",
  evermont: "Evermont",
  nachhilfe: "Nachhilfe",
  allgemein: "Allgemein",
};

const DOT = {
  corelegal: "bg-area-corelegal",
  evermont: "bg-area-evermont",
  nachhilfe: "bg-area-nachhilfe",
  allgemein: "bg-area-allgemein",
};

export function AreaBadge({ area }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-ivory/70">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[area]}`} />
      {AREA_LABELS[area]}
    </span>
  );
}
