import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { CommandPalette } from "./CommandPalette";
import { apiFetch } from "../api/client";

export function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    apiFetch("/settings")
      .then((s) => {
        document.documentElement.classList.toggle("reduce-motion", !!s["appearance.reduced_motion"]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-4 px-4 pb-10 pt-4 sm:px-6 lg:gap-6">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <div className="min-w-0 flex-1">
        <header className="glass-panel mb-4 flex items-center gap-3 px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Menü öffnen"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ivory/80 hover:bg-white/[0.06]"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="flex-1 font-semibold text-ivory">Dashboard</span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Suche öffnen"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ivory/80 hover:bg-white/[0.06]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
        </header>

        <main>{children}</main>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
