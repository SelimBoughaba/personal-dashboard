function DefaultIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l1.5 3h7L17 12h4" />
      <path d="M6 12 4.5 6.5A1 1 0 0 1 5.46 5.2h13.08a1 1 0 0 1 .96 1.3L18 12" />
      <path d="M6 12v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5" />
    </svg>
  );
}

export function EmptyState({ icon, title, description, action, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1.5 rounded-brand border border-dashed border-white/10 px-6 py-12 text-center ${className}`}
    >
      <div className="mb-1 text-ivory/20">{icon || <DefaultIcon />}</div>
      <p className="text-sm font-medium text-ivory/55">{title}</p>
      {description && <p className="max-w-sm text-sm text-ivory/35">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
