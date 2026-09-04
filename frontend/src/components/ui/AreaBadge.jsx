import { useAreas } from "../../context/AreasContext";

export function AreaBadge({ area }) {
  const { byId } = useAreas();
  const info = byId[area];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-ivory/70">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info?.color || "#94a08f" }} />
      {info?.label || area}
      {info?.archived ? <span className="text-ivory/30">· archiviert</span> : null}
    </span>
  );
}
