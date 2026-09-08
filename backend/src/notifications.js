// Benachrichtigungszentrum (Punkt 76 der Design-Erweiterung).
//
// Fristen und Integrationsfehler werden bewusst NIE dauerhaft gespeichert -
// sie werden bei jedem Abruf live aus den echten Tabellen (Fristen) bzw. aus
// dem Ergebnis des letzten tatsächlichen Verbindungsversuchs (Fehler)
// berechnet, siehe recordIntegrationError/clearIntegrationError unten. Nur
// zwei schmale Tabellen halten Zustand: notification_events für Ereignisse,
// die sich nicht aus dem aktuellen Datenstand rekonstruieren lassen
// (abgeschlossener Hintergrund-Scan, laufender Integrationsfehler seit dem
// letzten Versuch), und notification_states für den Gelesen/Erledigt/
// Verschoben-Status je Benachrichtigung (über einen Schlüssel statt eines
// Fremdschlüssels, damit dieselbe Zustandstabelle sowohl live berechnete
// als auch gespeicherte Benachrichtigungen abdeckt).
//
// "Kein ewiges Volltextprotokoll sämtlicher sensibler Inhalte": Titel/Text
// in notification_events bleiben bewusst generisch (z. B. "3 neue
// Rechnungsvorschläge gefunden", nie Absender, Beträge oder Betreffzeilen).

import { db } from "./db.js";
import { addDays, todayIso } from "./recurrence.js";
import { getEvents } from "./caldav.js";

const DEADLINE_LOOKAHEAD_DAYS = 7;
export const TYPE_PATH = { aufgabe: "/aufgaben", rechnung: "/finanzen", vertrag: "/vertraege" };

function deadlineKey(type, id) {
  return `deadline:${type}:${id}`;
}

// Live berechnete Fristen: überfällige und in den nächsten
// DEADLINE_LOOKAHEAD_DAYS Tagen fällige offene Aufgaben/Rechnungen sowie
// bald anstehende Vertragsverlängerungen. Kein separater "erledigt"-Zustand
// nötig - sobald die zugrundeliegende Aufgabe/Rechnung erledigt bzw. das
// Verlängerungsdatum verschoben wird, verschwindet die Frist von selbst aus
// dieser Liste.
export function computeDeadlineNotifications() {
  const today = todayIso();
  const horizon = addDays(today, DEADLINE_LOOKAHEAD_DAYS);

  const tasks = db
    .prepare(`SELECT id, title, due_date FROM tasks WHERE status = 'offen' AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date`)
    .all(horizon);
  const invoices = db
    .prepare(`SELECT id, subject, sender_name, due_date FROM invoices WHERE status = 'offen' AND due_date IS NOT NULL AND due_date <= ? ORDER BY due_date`)
    .all(horizon);
  const contracts = db
    .prepare(`SELECT id, title, next_renewal_date FROM contracts WHERE next_renewal_date IS NOT NULL AND next_renewal_date <= ? ORDER BY next_renewal_date`)
    .all(horizon);

  const items = [
    ...tasks.map((t) => ({ type: "aufgabe", id: t.id, title: t.title, date: t.due_date })),
    ...invoices.map((i) => ({
      type: "rechnung",
      id: i.id,
      title: i.sender_name ? `${i.sender_name} – ${i.subject}` : i.subject,
      date: i.due_date,
    })),
    ...contracts.map((c) => ({ type: "vertrag", id: c.id, title: c.title, date: c.next_renewal_date })),
  ];

  return items.map((item) => ({
    key: deadlineKey(item.type, item.id),
    category: "deadline",
    title: item.title,
    date: item.date,
    overdue: item.date < today,
    path: TYPE_PATH[item.type],
  }));
}

// Ein Integrationsfehler bleibt genau der EINE aktuelle Zustand pro
// Integration (upsert über den Schlüssel) - kein wachsendes Fehlerprotokoll.
// Wird an der Stelle aufgerufen, an der ohnehin schon ein echter
// Verbindungsversuch unternommen wird (GET /calendar/events,
// POST /invoices/scan), statt dafür einen eigenen, zusätzlichen
// Verbindungstest nur für das Benachrichtigungszentrum zu bauen.
export function recordIntegrationError(key, title, body) {
  db.prepare(
    `INSERT INTO notification_events (key, category, title, body, created_at)
     VALUES (@key, 'integration_error', @title, @body, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET title = excluded.title, body = excluded.body, created_at = excluded.created_at`,
  ).run({ key, title, body: body || "" });
}

export function clearIntegrationError(key) {
  db.prepare(`DELETE FROM notification_events WHERE key = ? AND category = 'integration_error'`).run(key);
}

// Ereignis für einen abgeschlossenen Hintergrundvorgang (aktuell: der
// Mail-Scan für Rechnungsvorschläge). Ein Aufruf pro Kalendertag reicht -
// mehrere Scans am selben Tag aktualisieren nur Zähler/Zeitstempel des
// bestehenden Ereignisses statt eine wachsende Liste zu erzeugen.
export function recordBackgroundEvent(key, title, body) {
  db.prepare(
    `INSERT INTO notification_events (key, category, title, body, created_at)
     VALUES (@key, 'background', @title, @body, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET title = excluded.title, body = excluded.body, created_at = excluded.created_at`,
  ).run({ key, title, body: body || "" });
  // Ein erfolgreicher Lauf löst denselben Integrationsfehler-Zustand auf,
  // falls einer vom letzten fehlgeschlagenen Versuch noch offen war.
  clearIntegrationError("error:mail");
}

function loadStates(keys) {
  if (keys.length === 0) return new Map();
  const placeholders = keys.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM notification_states WHERE key IN (${placeholders})`).all(...keys);
  return new Map(rows.map((r) => [r.key, r]));
}

// Wird bei jedem Abruf der Benachrichtigungsliste ausgeführt (wie schon die
// "Bekannte Zeitbelegung"-Abfrage im Wochenrückblick) - ein einzelner
// Kalenderabruf über ein Tagesfenster ist billig und durch die CalDAV-
// Timeout-Budgets (caldav.js) nach oben begrenzt, schlägt also nie
// unbegrenzt lange fehl. Für Mail gibt es bewusst KEIN äquivalentes
// Live-Probing hier: ein Postfach-Scan ist ein teurer Vorgang mit
// Seiteneffekten (legt Rechnungsvorschläge an) und darf nicht implizit
// beim bloßen Öffnen des Benachrichtigungszentrums ausgelöst werden - der
// Mail-Fehlerzustand kommt stattdessen vom letzten ECHTEN Scan-Versuch
// (siehe recordBackgroundEvent/recordIntegrationError-Aufrufe in
// routes/invoices.js).
export async function checkCalendarConnection() {
  try {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 1);
    await getEvents({ from: from.toISOString(), to: to.toISOString() });
    clearIntegrationError("error:calendar");
  } catch (err) {
    if (err.code !== "NOT_CONFIGURED") {
      recordIntegrationError("error:calendar", "Kalender-Verbindung fehlgeschlagen", "iCloud-Zugangsdaten/App-Passwort prüfen.");
    }
  }
}

// Liefert die aktuell aktiven Benachrichtigungen (Fristen live berechnet +
// gespeicherte Hintergrund-/Fehlerereignisse), jeweils mit ihrem
// Gelesen/Erledigt/Verschoben-Zustand verknüpft. Erledigte und noch
// verschobene (snoozed_until in der Zukunft) Einträge werden standardmäßig
// herausgefiltert - "deduplizieren und pro Kategorie steuern" (Punkt 76).
export function listActiveNotifications() {
  const today = todayIso();
  const deadlines = computeDeadlineNotifications();
  const events = db.prepare(`SELECT * FROM notification_events ORDER BY created_at DESC`).all();
  const stored = events.map((e) => ({
    key: e.key,
    category: e.category,
    title: e.title,
    body: e.body,
    date: null,
    overdue: false,
    path: null,
  }));

  const all = [...deadlines, ...stored];
  const states = loadStates(all.map((n) => n.key));

  const withState = all.map((n) => {
    const s = states.get(n.key);
    return {
      ...n,
      read: !!s?.read_at,
      done: !!s?.done_at,
      snoozedUntil: s?.snoozed_until || null,
    };
  });

  return withState
    .filter((n) => !n.done)
    .filter((n) => !n.snoozedUntil || n.snoozedUntil <= today)
    .sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      if (a.category === "deadline" && b.category === "deadline") return (a.date || "").localeCompare(b.date || "");
      return 0;
    });
}

export function setNotificationState(key, patch) {
  const existing = db.prepare(`SELECT key FROM notification_states WHERE key = ?`).get(key);
  if (existing) {
    const sets = [];
    const params = { key };
    if ("read" in patch) {
      sets.push("read_at = @read_at");
      params.read_at = patch.read ? new Date().toISOString() : null;
    }
    if ("done" in patch) {
      sets.push("done_at = @done_at");
      params.done_at = patch.done ? new Date().toISOString() : null;
    }
    if ("snoozedUntil" in patch) {
      sets.push("snoozed_until = @snoozed_until");
      params.snoozed_until = patch.snoozedUntil || null;
    }
    if (sets.length > 0) {
      db.prepare(`UPDATE notification_states SET ${sets.join(", ")} WHERE key = @key`).run(params);
    }
  } else {
    db.prepare(
      `INSERT INTO notification_states (key, read_at, done_at, snoozed_until) VALUES (@key, @read_at, @done_at, @snoozed_until)`,
    ).run({
      key,
      read_at: patch.read ? new Date().toISOString() : null,
      done_at: patch.done ? new Date().toISOString() : null,
      snoozed_until: patch.snoozedUntil || null,
    });
  }
}
