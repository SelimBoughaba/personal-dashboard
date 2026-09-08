import { NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useSavedViews } from "../hooks/useSavedViews";
import { useNotifications } from "../hooks/useNotifications";

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
  suche: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  einstellungen: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  chevron: (
    <path d="M9 6l6 6-6 6" />
  ),
  ansichten: (
    <path d="M6 3h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 4h6M9 11h6M9 15h4" />
  ),
};

function Icon({ name, className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
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
  { label: "Fokus", path: "/fokus", enabled: true },
  { label: "Wochenrückblick", path: "/wochenrueckblick", enabled: true },
  { label: "Benachrichtigungen", path: "/benachrichtigungen", enabled: true },
  { label: "Papierkorb", path: "/papierkorb", enabled: true },
  { label: "E-Mail", path: "/mail", enabled: true },
  { label: "Verträge & Abos", path: "/vertraege", enabled: true },
  { label: "Vorgänge", path: "/vorgaenge", enabled: true },
  { label: "Gesundheit", path: "/gesundheit", enabled: true },
  { label: "Notizen", path: "/notizen", enabled: true },
  { label: "Prompt-Bibliothek", path: "/prompts", enabled: true },
  { label: "LinkedIn", path: "/linkedin", enabled: true },
  { label: "Einstellungen", path: "/einstellungen", icon: "einstellungen", enabled: true },
];

function MoreLink({ item }) {
  if (!item.enabled) {
    return (
      <div
        className="flex items-center justify-between rounded-control px-2.5 py-2 text-[13px] text-ivory/30"
        title="In Entwicklung"
      >
        {item.label}
        <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-xs text-ivory/40">bald</span>
      </div>
    );
  }
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) =>
        `flex items-center justify-between gap-2 rounded-control px-2.5 py-2 text-[13px] transition-colors duration-200 ${
          isActive ? "text-ivory" : "text-ivory/65 hover:text-ivory"
        }`
      }
    >
      <span>{item.label}</span>
      {item.badge && <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-xs text-accent">{item.badge}</span>}
    </NavLink>
  );
}

function NavRow({ item, collapsed }) {
  const base = `flex items-center rounded-control py-2.5 text-sm transition-colors duration-200 ${
    collapsed ? "justify-center px-0" : "gap-3 px-3"
  }`;
  if (!item.enabled) {
    return (
      <div className={`${base} cursor-default text-ivory/30`} title="In Entwicklung">
        <Icon name={item.icon} />
        {!collapsed && <span className="flex-1">{item.label}</span>}
      </div>
    );
  }
  return (
    <NavLink
      to={item.path}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `relative ${base} ${isActive ? "bg-white/[0.07] text-ivory" : "text-ivory/65 hover:bg-white/[0.04] hover:text-ivory"}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-3 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />}
          <Icon name={item.icon} />
          {!collapsed && <span className="flex-1">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

// Gespeicherte Arbeitsansichten (Punkt 75) - nur sichtbar, wenn wirklich
// welche gepinnt sind (keine leere, dauerhaft reservierte Sektion). Jeder
// Eintrag verlinkt auf Pfad+Filter-Query der Seite, auf der er gespeichert
// wurde; ein eigener "×"-Button löst direkt hier das Entpinnen aus, ohne
// erst zur Einstellungsseite wechseln zu müssen.
function SavedViewsSection({ collapsed }) {
  const { views, removeView } = useSavedViews();
  const [open, setOpen] = useState(false);

  if (views.length === 0) return null;

  const list = (
    <ul className={collapsed ? "space-y-0.5" : "ml-8 mt-1 space-y-0.5 border-l border-white/10 pl-3"}>
      {views.map((v) => (
        <li key={v.id} className="group flex items-center justify-between gap-1">
          <NavLink
            to={`${v.path}?${v.search}`}
            className={({ isActive }) =>
              `min-w-0 flex-1 truncate rounded-control px-2.5 py-2 text-[13px] transition-colors duration-200 ${
                isActive ? "text-ivory" : "text-ivory/65 hover:text-ivory"
              }`
            }
          >
            {v.label}
          </NavLink>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              removeView(v.id);
            }}
            aria-label={`Ansicht „${v.label}“ entfernen`}
            className="shrink-0 px-1 text-ivory/40 opacity-0 hover:text-status-hoch group-hover:opacity-100 group-focus-within:opacity-100"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );

  if (collapsed) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          title="Ansichten"
          className="flex w-full items-center justify-center rounded-control py-2.5 text-sm text-ivory/65 transition-colors duration-200 hover:bg-white/[0.04] hover:text-ivory"
        >
          <Icon name="ansichten" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="overlay-panel absolute left-full top-0 z-40 ml-2 w-52 p-1.5">{list}</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 rounded-control px-3 py-2.5 text-sm text-ivory/65">
        <Icon name="ansichten" />
        <span className="flex-1 text-left">Ansichten</span>
      </div>
      {list}
    </div>
  );
}

// "Links eine lesbare einklappbare Navigation" (Punkt 53): im eingeklappten
// Zustand bleiben nur die Icons (mit Tooltip per title) sichtbar, "Mehr"
// öffnet dann statt der eingerückten Liste ein schwebendes Popover daneben -
// dieselben Ziele bleiben erreichbar, nur ohne den Platz elf ausgeschriebener
// Zeilen zu beanspruchen.
function SidebarContent({ onNavigate, onOpenSearch, collapsed, onToggleCollapse }) {
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  // withPreferences:false - reine Zähler-Anzeige, kein doppeltes Laden der
  // Einstellungen und kein doppeltes Auslösen nativer Mitteilungen neben
  // einer parallel geöffneten Benachrichtigungsseite (siehe useNotifications).
  const { unreadCount } = useNotifications({ withPreferences: false });
  const moreItems = MORE_ITEMS.map((item) =>
    item.path === "/benachrichtigungen" && unreadCount > 0 ? { ...item, badge: String(unreadCount) } : item,
  );

  return (
    <div className="flex h-full flex-col" onClick={onNavigate}>
      <div className={`flex items-center pb-6 pt-1 ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}`}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" className="shrink-0 text-ivory">
          <path d="M3 17 L9 6 L12.5 12 L15.5 5 L21 17 Z" fill="currentColor" />
        </svg>
        {!collapsed && <span className="flex-1 font-bold tracking-tight text-ivory">Dashboard</span>}
        {onToggleCollapse && !collapsed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse();
            }}
            aria-label="Navigation einklappen"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-ivory/55 hover:bg-white/[0.06] hover:text-ivory"
          >
            <Icon name="chevron" className="rotate-180" />
          </button>
        )}
      </div>

      {onToggleCollapse && collapsed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          aria-label="Navigation ausklappen"
          className="mb-4 flex h-8 items-center justify-center rounded-control text-ivory/55 hover:bg-white/[0.06] hover:text-ivory"
        >
          <Icon name="chevron" />
        </button>
      )}

      {onOpenSearch &&
        (collapsed ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSearch();
            }}
            aria-label="Suche öffnen (⌘K)"
            title="Suche öffnen (⌘K)"
            className="mb-3 flex h-9 items-center justify-center rounded-control border border-white/10 bg-white/[0.02] text-ivory/50 transition-colors duration-200 hover:bg-white/[0.05]"
          >
            <Icon name="suche" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSearch();
            }}
            className="mb-3 flex items-center gap-3 rounded-control border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-ivory/50 transition-colors duration-200 hover:bg-white/[0.05]"
          >
            <Icon name="suche" />
            <span className="flex-1 text-left">Suchen…</span>
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-xs text-ivory/65">⌘K</span>
          </button>
        ))}

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.label} item={item} collapsed={collapsed} />
        ))}

        <SavedViewsSection collapsed={collapsed} />

        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMoreOpen((v) => !v);
            }}
            title={collapsed ? "Mehr" : undefined}
            className={`flex w-full items-center rounded-control py-2.5 text-sm text-ivory/65 transition-colors duration-200 hover:bg-white/[0.04] hover:text-ivory ${
              collapsed ? "justify-center px-0" : "gap-3 px-3"
            }`}
          >
            <Icon name="mehr" />
            {!collapsed && (
              <>
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
              </>
            )}
          </button>

          {collapsed ? (
            moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div className="overlay-panel absolute left-full top-0 z-40 ml-2 w-52 space-y-0.5 p-1.5">
                  {moreItems.map((item) => (
                    <MoreLink key={item.label} item={item} />
                  ))}
                </div>
              </>
            )
          ) : (
            <div
              className="grid overflow-hidden transition-all duration-200 ease-out"
              style={{ gridTemplateRows: moreOpen ? "1fr" : "0fr" }}
              // Visuell eingeklappt heißt nicht automatisch aus Tab-Reihenfolge
              // und Accessibility-Baum entfernt – ohne inert bleiben die
              // Links per Tab erreichbar, obwohl sie (fast) unsichtbar sind.
              // Bedingtes Spreaden statt inert={!moreOpen}: bei älteren
              // React-Versionen würde inert={false} als Attribut inert="false"
              // gerendert, was der Browser trotzdem als "inert" liest.
              {...(moreOpen ? {} : { inert: "" })}
            >
              <div className="min-h-0">
                <div className="ml-8 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                  {moreItems.map((item) => (
                    <MoreLink key={item.label} item={item} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          logout();
        }}
        title={collapsed ? "Abmelden" : undefined}
        className={`flex items-center rounded-control py-2.5 text-sm text-ivory/55 transition-colors duration-200 hover:bg-white/[0.04] hover:text-ivory ${
          collapsed ? "justify-center px-0" : "gap-3 px-3"
        }`}
      >
        <Icon name="logout" />
        {!collapsed && "Abmelden"}
      </button>
    </div>
  );
}

const COLLAPSE_KEY = "dashboard_sidebar_collapsed";

export function Sidebar({ mobileOpen, onCloseMobile, onOpenSearch }) {
  // Geräte-/fensterbezogene Layoutpräferenz, kein Konto-Einstellungswert wie
  // Theme/Reduced-Motion - localStorage genügt, kein Backend-Roundtrip nötig.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage kann in seltenen Fällen (privates Fenster o.ä.) fehlen
      // oder blockiert sein - die Einklapp-Funktion bleibt dann nutzbar,
      // die Präferenz wird nur nicht über einen Neuladen hinweg gemerkt.
    }
  }, [collapsed]);

  return (
    <>
      {/* Desktop: feste Sidebar */}
      <aside
        className={`glass-panel sticky top-4 hidden h-[calc(100vh-2rem)] shrink-0 flex-col p-3 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <SidebarContent
          onOpenSearch={onOpenSearch}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </aside>

      {/* Mobile: einklappbares Drawer-Panel - immer vollständig ausgeklappt,
          die Einklapp-Präferenz betrifft nur die feste Desktop-Sidebar. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <aside className="overlay-panel absolute inset-y-3 left-3 flex w-64 flex-col p-3">
            <SidebarContent onNavigate={onCloseMobile} onOpenSearch={onOpenSearch} collapsed={false} />
          </aside>
        </div>
      )}
    </>
  );
}
