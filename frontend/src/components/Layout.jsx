import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/Button";

const NAV_ITEMS = [
  { label: "Aufgaben", active: true },
  { label: "Kalender", active: false },
  { label: "Mail", active: false },
  { label: "Rechnungen", active: false },
];

export function Layout({ children }) {
  const { logout } = useAuth();

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <header className="glass-panel mb-6 flex items-center justify-between px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Dashboard</h1>
          <p className="text-xs text-slate-400">Corelegal · Evermont · Nachhilfe</p>
        </div>
        <Button variant="ghost" onClick={logout}>
          Abmelden
        </Button>
      </header>

      <nav className="mb-6 flex gap-2 overflow-x-auto">
        {NAV_ITEMS.map((item) => (
          <span
            key={item.label}
            className={`rounded-xl border px-4 py-2 text-sm whitespace-nowrap ${
              item.active
                ? "border-accent-500/30 bg-accent-500/10 text-accent-400"
                : "border-white/5 bg-white/[0.02] text-slate-500"
            }`}
            title={item.active ? undefined : "Folgt in einer späteren Etappe"}
          >
            {item.label}
            {!item.active && <span className="ml-1.5 text-[10px]">bald</span>}
          </span>
        ))}
      </nav>

      <main>{children}</main>
    </div>
  );
}
