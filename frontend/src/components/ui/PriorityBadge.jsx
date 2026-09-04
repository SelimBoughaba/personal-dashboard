const STYLES = {
  hoch: "text-status-hoch bg-status-hoch/10 border-status-hoch/25",
  mittel: "text-status-mittel bg-status-mittel/10 border-status-mittel/25",
  niedrig: "text-status-niedrig bg-status-niedrig/10 border-status-niedrig/25",
};

export function PriorityBadge({ priority }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${STYLES[priority]}`}>
      {priority}
    </span>
  );
}
