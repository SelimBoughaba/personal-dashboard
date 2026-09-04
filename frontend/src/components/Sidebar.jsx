import { NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const ICONS = {
  uebersicht: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  kalender: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M8 2.5v4M16 2.5v4" />
    </>
  ),
  aufgaben: (
    <>
      <path d="M4 6h11M4 12h11M4 18h7" />
      <path d="M18 5l1.6 1.6L23 3" />
    </>
  ),
  finanzen: (
    <>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10.5h19" />
      <path d="M16 15h3" />
    </>
  ),
  ziele: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  dokumente: (
    <>
      <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  mehr: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  logout: (
    <>
      <path d="M9 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h4" />
      <path d="M16 16l5-4-5-4" />
      <path d="M21 12H9" />
    </>
  ),
  einstellungen: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {ICONS[name]}
    </svg>
  );
}

const NAV_ITEMS = [
  { label: "Übersicht", path: "/", icon: "uebersicht", enabled: true, end: true },
  { label: "Kalender", path: "/kalender", icon: "kalender", enabled: true },
  { label: "Aufgaben", path: "/aufgaben", icon: "aufgaben", enabled: true },
  { label: "Finanzen", path: "/finanzen", icon: "finanzen", enabled: true },
  { label: "Ziele", path: "/ziele", icon: "ziele", enabled: true },
  { label: "Dokumente", path: "/dokumente", icon: "dokumente", enabled: true },
];

const MORE_ITEMS = [
  { label: "Verträge & Abos", path: "/vertraege", enabled: true },
  { label: "Gesundheit", enabled: false },
  { label: "Notizen", enabled: false },
  { label: "Einstellungen", path: "/einstellungen", icon: "einstellungen", enabled: true },
];

function NavRow({ item }) {
  const base = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200";
  if (!item.enabled) {
    return (
      <div className={`${base} cursor-default text-ivory/30`} title="In Entwicklung">
        <Icon name={item.icon} />
        <span className="flex-1">{item.label}</span>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-ivory/40">bald</span>
      </div>
    );
  }
  return (
    <NavLink
      to={item.path}
      end={item.end}
      className={({ isActive }) =>
        `${base} ${isActive ? "bg-white/[0.07] text-ivory" : "text-ivory/65 hover:bg-white/[0.04] hover:text-ivory"}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} />
          <span className="flex-1">{item.label}</span>
          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-lime" />}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }) {
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="flex h-full flex-col" onClick={onNavigate}>
      <div className="flex items-center gap-2.5 px-3 pb-6 pt-1">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M3 17 L9 6 L12.5 12 L15.5 5 L21 17 Z" fill="#f3f1e9" />
        </svg>
        <span className="font-semibold tracking-tight text-ivory">Dashboard</span>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.label} item={item} />
        ))}

        <div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMoreOpen((v) => !v);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ivory/65 transition-colors duration-200 hover:bg-white/[0.04] hover:text-ivory"
          >
            <Icon name="mehr" />
            <span className="flex-1 text-left">Mehr</span>
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className={`shrink-0 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`}
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div
            className="grid overflow-hidden transition-all duration-200 ease-out"
            style={{ gridTemplateRows: moreOpen ? "1fr" : "0fr" }}
          >
            <div className="min-h-0">
              <div className="ml-8 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                {MORE_ITEMS.map((item) =>
                  item.enabled ? (
                    <NavLink
                      key={item.label}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-200 ${
                          isActive ? "text-ivory" : "text-ivory/65 hover:text-ivory"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ) : (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-ivory/30"
                      title="In Entwicklung"
                    >
                      {item.label}
                      <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] text-ivory/40">bald</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          logout();
        }}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ivory/55 transition-colors duration-200 hover:bg-white/[0.04] hover:text-ivory"
      >
        <Icon name="logout" />
        Abmelden
      </button>
    </div>
  );
}

export function Sidebar({ mobileOpen, onCloseMobile }) {
  return (
    <>
      {/* Desktop: feste Sidebar */}
      <aside className="glass-panel sticky top-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col p-3 lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile: einklappbares Drawer-Panel */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside className="glass-panel absolute inset-y-3 left-3 flex w-64 flex-col p-3">
            <SidebarContent onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
