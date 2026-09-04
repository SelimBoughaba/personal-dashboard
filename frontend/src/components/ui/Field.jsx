const fieldClass =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent-500/50 focus:outline-none focus:ring-1 focus:ring-accent-500/50";

export function Input(props) {
  return <input className={fieldClass} {...props} />;
}

export function Textarea(props) {
  return <textarea className={fieldClass} {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className={`${fieldClass} appearance-none`} {...props}>
      {children}
    </select>
  );
}

export function Label({ children }) {
  return <label className="mb-1 block text-xs font-medium text-slate-400">{children}</label>;
}
