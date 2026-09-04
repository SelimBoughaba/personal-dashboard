import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { GlassCard } from "../components/ui/GlassCard";
import { AreaBadge } from "../components/ui/AreaBadge";

const NAME_KEY = "dashboard_display_name";
const HIDDEN_WIDGETS_KEY = "dashboard_hidden_widgets";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

function fmtEuro(v) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

function loadHidden() {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_WIDGETS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function WidgetShell({ id, title, hidden, onHide, action, children }) {
  if (hidden.has(id)) return null;
  return (
    <GlassCard className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ivory">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={() => onHide(id)}
            className="text-ivory/30 hover:text-ivory/70"
            title="Modul ausblenden"
            aria-label={`${title} ausblenden`}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
      {children}
    </GlassCard>
  );
}

export function Uebersicht() {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [editingName, setEditingName] = useState(false);
  const [hidden, setHidden] = useState(loadHidden);

  const [tasks, setTasks] = useState([]);
  const [events, setEvents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [mails, setMails] = useState([]);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      apiFetch("/tasks?area=alle&sort=due_date"),
      apiFetch(`/calendar/events?${new URLSearchParams({ from: new Date().toISOString(), to: (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString(); })() })}`),
      apiFetch("/invoices?area=alle&status=offen"),
      apiFetch("/mail/messages"),
    ]);
    const [tasksR, eventsR, invoicesR, mailsR] = results;
    if (tasksR.status === "fulfilled") setTasks(tasksR.value);
    if (eventsR.status === "fulfilled") setEvents(eventsR.value);
    if (invoicesR.status === "fulfilled") setInvoices(invoicesR.value);
    if (mailsR.status === "fulfilled") setMails(mailsR.value);
    setErrors({
      tasks: tasksR.status === "rejected" ? tasksR.reason.message : null,
      events: eventsR.status === "rejected" ? eventsR.reason.message : null,
      invoices: invoicesR.status === "rejected" ? invoicesR.reason.message : null,
      mails: mailsR.status === "rejected" ? mailsR.reason.message : null,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function hideWidget(id) {
    const next = new Set(hidden);
    next.add(id);
    setHidden(next);
    localStorage.setItem(HIDDEN_WIDGETS_KEY, JSON.stringify([...next]));
  }

  function showAllWidgets() {
    setHidden(new Set());
    localStorage.removeItem(HIDDEN_WIDGETS_KEY);
  }

  function saveName(e) {
    e.preventDefault();
    localStorage.setItem(NAME_KEY, name.trim());
    setEditingName(false);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const openTasks = tasks.filter((t) => t.status === "offen");
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < todayIso);
  const topTasks = openTasks.slice(0, 5);

  const overdueInvoices = invoices.filter((i) => i.due_date && i.due_date < todayIso);
  const openSum = invoices.reduce((s, i) => s + (i.amount || 0), 0);

  const importantMails = mails.filter((m) => m.unread || m.flagged).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {editingName ? (
            <form onSubmit={saveName} className="flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                placeholder="Dein Name"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-2xl font-semibold text-ivory outline-none focus:border-lime/40"
              />
            </form>
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="cursor-pointer text-2xl font-semibold tracking-tight text-ivory sm:text-3xl"
              title="Namen bearbeiten"
            >
              {greeting()}
              {name ? `, ${name}` : ""}.
            </h1>
          )}
          <p className="mt-1 text-sm text-ivory/50">
            {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/aufgaben" className="rounded-brand border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-ivory/75 hover:bg-white/[0.06]">
            + Aufgabe
          </Link>
          <Link to="/kalender" className="rounded-brand border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-ivory/75 hover:bg-white/[0.06]">
            + Termin
          </Link>
          <Link to="/finanzen" className="rounded-brand border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-ivory/75 hover:bg-white/[0.06]">
            + Rechnung
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <WidgetShell id="termine" title="Heutige Termine" hidden={hidden} onHide={hideWidget}>
          {errors.events && <p className="text-sm text-status-hoch">{errors.events}</p>}
          {!errors.events && events.length === 0 && <p className="text-sm text-ivory/40">Keine Termine heute.</p>}
          <div className="space-y-2.5">
            {events.slice(0, 5).map((ev) => (
              <div key={ev.id} className="flex items-center gap-2.5 text-sm">
                <span className="w-11 shrink-0 text-xs text-ivory/45">
                  {ev.allDay ? "ganztägig" : new Date(ev.start).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="truncate text-ivory/85">{ev.title}</span>
              </div>
            ))}
          </div>
          {events.length > 0 && (
            <Link to="/kalender" className="mt-3 inline-block text-xs text-ivory/45 hover:text-ivory">
              Alle Termine ansehen →
            </Link>
          )}
        </WidgetShell>

        <WidgetShell id="aufgaben" title="Wichtigste Aufgaben" hidden={hidden} onHide={hideWidget}>
          {errors.tasks && <p className="text-sm text-status-hoch">{errors.tasks}</p>}
          {overdueTasks.length > 0 && (
            <p className="mb-2 text-xs text-status-hoch">{overdueTasks.length} überfällig</p>
          )}
          {!errors.tasks && topTasks.length === 0 && <p className="text-sm text-ivory/40">Keine offenen Aufgaben.</p>}
          <div className="space-y-2.5">
            {topTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 text-sm">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.due_date && t.due_date < todayIso ? "bg-status-hoch" : "bg-white/20"}`} />
                <span className="truncate text-ivory/85">{t.title}</span>
              </div>
            ))}
          </div>
          <Link to="/aufgaben" className="mt-3 inline-block text-xs text-ivory/45 hover:text-ivory">
            Alle Aufgaben ansehen →
          </Link>
        </WidgetShell>

        <WidgetShell id="rechnungen" title="Offene Rechnungen" hidden={hidden} onHide={hideWidget}>
          {errors.invoices && <p className="text-sm text-status-hoch">{errors.invoices}</p>}
          {!errors.invoices && (
            <p className="mb-2 text-2xl font-semibold text-ivory">{fmtEuro(openSum)}</p>
          )}
          {overdueInvoices.length > 0 && (
            <p className="mb-2 text-xs text-status-hoch">{overdueInvoices.length} überfällig</p>
          )}
          <div className="space-y-2.5">
            {invoices.slice(0, 4).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-ivory/85">{i.sender_name || i.sender || "Unbekannt"}</span>
                <span className="shrink-0 text-ivory/55">{fmtEuro(i.amount || 0)}</span>
              </div>
            ))}
          </div>
          <Link to="/finanzen" className="mt-3 inline-block text-xs text-ivory/45 hover:text-ivory">
            Alle Rechnungen ansehen →
          </Link>
        </WidgetShell>

        <WidgetShell id="mails" title="Wichtige E-Mails" hidden={hidden} onHide={hideWidget}>
          {errors.mails && <p className="text-sm text-ivory/40">{errors.mails}</p>}
          {!errors.mails && importantMails.length === 0 && <p className="text-sm text-ivory/40">Nichts Ungelesenes.</p>}
          <div className="space-y-2.5">
            {importantMails.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 text-sm">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.unread ? "bg-lime" : "bg-white/20"}`} />
                <span className="min-w-0 flex-1 truncate text-ivory/85">{m.subject}</span>
                <AreaBadge area={m.area} />
              </div>
            ))}
          </div>
        </WidgetShell>
      </div>

      <p className="text-xs text-ivory/30">
        Weitere Übersichts-Module (Ziele, Dokumente, Verträge &amp; Abos, Gesundheit) erscheinen hier, sobald die
        jeweiligen Bereiche umgesetzt sind.
        {hidden.size > 0 && (
          <>
            {" · "}
            <button onClick={showAllWidgets} className="text-ivory/45 underline hover:text-ivory">
              {hidden.size} ausgeblendete{hidden.size === 1 ? "s Modul" : " Module"} wieder einblenden
            </button>
          </>
        )}
      </p>
    </div>
  );
}
