const STYLES = {
  hoch: "text-red-300 bg-red-500/10 border-red-500/20",
  mittel: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  niedrig: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
};

export function PriorityBadge({ priority }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${STYLES[priority]}`}>
      {priority}
    </span>
  );
}
