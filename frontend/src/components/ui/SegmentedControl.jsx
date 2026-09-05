export function SegmentedControl({ options, value, onChange, className = "" }) {
  return (
    <div className={`inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-0.5 ${className}`}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              active ? "bg-white/10 text-ivory" : "text-ivory/55 hover:text-ivory"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
