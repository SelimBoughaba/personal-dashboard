import { GlassCard } from "./GlassCard";

const TONES = {
  default: "text-ivory",
  danger: "text-status-hoch",
  accent: "text-lime",
};

export function StatTile({ label, value, tone = "default", hint, className = "" }) {
  return (
    <GlassCard className={`!p-4 ${className}`}>
      <p className="text-xs text-ivory/45">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${TONES[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ivory/35">{hint}</p>}
    </GlassCard>
  );
}
