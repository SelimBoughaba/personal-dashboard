import { useId, cloneElement } from "react";

const fieldClass =
  "w-full rounded-control border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-ivory placeholder:text-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/40";

export function Input({ className = "", ...props }) {
  return <input className={`${fieldClass} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }) {
  return <textarea className={`${fieldClass} ${className}`} {...props} />;
}

export function Select({ children, className = "", ...props }) {
  return (
    <select className={`${fieldClass} appearance-none ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">
      {children}
    </label>
  );
}

// Verknüpft Label und Eingabefeld über eine automatisch generierte,
// stabile id/htmlFor-Paarung, ohne dass jede Seite selbst eine id
// erzeugen und durchreichen muss. Ohne diese Verknüpfung liest ein
// Screenreader Label und Feld nur über die visuelle Nähe zusammen
// (nicht zuverlässig), und ein Klick auf das Label-Wort fokussiert
// das Feld nicht.
export function FormField({ label, children, className = "" }) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, { id })}
    </div>
  );
}
