import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/Button";

const NAV_ITEMS = [
  { label: "Aufgaben", path: "/", enabled: true },
  { label: "Kalender", path: "/kalender", enabled: true },
  { label: "Mail", path: "/mail", enabled: false },
  { label: "Rechnungen", path: "/rechnungen", enabled: false },
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
        {NAV_ITEMS.map((item) =>
          item.enabled ? (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `rounded-xl border px-4 py-2 text-sm whitespace-nowrap ${
                  isActive
                    ? "border-accent-500/30 bg-accent-500/10 text-accent-400"
                    : "border-white/5 bg-white/[0.02] text-slate-400 hover:bg-white/[0.05]"
                }`
              }
            >
              {item.label}
            </NavLink>
          ) : (
            <span
              key={item.label}
              className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-sm whitespace-nowrap text-slate-500"
              title="Folgt in einer späteren Etappe"
            >
              {item.label}
              <span className="ml-1.5 text-[10px]">bald</span>
            </span>
          ),
        )}
      </nav>

      <main>{children}</main>
    </div>
  );
}
