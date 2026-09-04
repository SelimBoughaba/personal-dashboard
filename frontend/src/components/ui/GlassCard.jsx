export function GlassCard({ children, className = "", ...props }) {
  return (
    <div className={`glass-panel p-5 ${className}`} {...props}>
      {children}
    </div>
  );
}
