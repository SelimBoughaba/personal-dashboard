const VARIANTS = {
  primary: "bg-ivory text-ink font-semibold hover:brightness-95",
  ghost: "bg-white/[0.03] hover:bg-white/[0.07] text-ivory border border-white/10",
  danger: "bg-status-hoch/10 hover:bg-status-hoch/20 text-status-hoch border border-status-hoch/25",
};

export function Button({ variant = "primary", className = "", ...props }) {
  return (
    <button
      className={`rounded-brand px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
