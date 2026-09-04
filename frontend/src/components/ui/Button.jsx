const VARIANTS = {
  primary:
    "bg-accent-500/90 hover:bg-accent-500 text-base-950 font-medium shadow-[0_0_20px_rgba(56,189,248,0.35)]",
  ghost:
    "bg-white/5 hover:bg-white/10 text-slate-100 border border-white/10",
  danger:
    "bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20",
};

export function Button({ variant = "primary", className = "", ...props }) {
  return (
    <button
      className={`rounded-xl px-4 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
