export function FilterChips({ options, value, onChange, className = "" }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              active
                ? "border-white/20 bg-white/10 text-ivory"
                : "border-white/10 bg-white/[0.03] text-ivory/55 hover:bg-white/[0.06] hover:text-ivory/80"
            }`}
          >
            {o.color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: o.color }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
