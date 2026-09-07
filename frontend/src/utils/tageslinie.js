// Gemeinsame Grammatik für die Tageslinie (Punkt 57 der Design-Erweiterung):
// Aufgaben, Kalendertermine und Rechnungen werden zu Einträgen derselben
// Form { key, type, time, title, area, detailLabel, raw } normalisiert, damit
// unterschiedliche Ansichten (aktuell: Heute-Bereich der Übersicht) dieselbe
// Zeitleisten-Logik verwenden können, statt sie pro Seite neu zu erfinden.
export function formatAmount(value) {
  if (value === null || value === undefined) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function formatTime(date) {
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export const TAGESLINIE_TYPE_LABEL = { task: "Aufgabe", event: "Termin", invoice: "Rechnung" };
export const TAGESLINIE_TYPE_PATH = { task: "/aufgaben", event: "/kalender", invoice: "/finanzen" };

// tasks/events/invoices: Rohdaten aus /tasks, /calendar/events, /invoices.
// todayIso: lokales Datum (localIsoDate()), nicht new Date().toISOString().
export function mergeTagesEntries({ tasks, events, invoices, todayIso }) {
  const taskEntries = tasks
    .filter((t) => t.due_date === todayIso && t.status !== "erledigt")
    .map((t) => ({
      key: `task-${t.id}`,
      type: "task",
      time: null,
      title: t.title,
      area: t.area,
      detailLabel: "Fällig heute",
      raw: t,
    }));

  const invoiceEntries = invoices
    .filter((i) => i.due_date === todayIso && i.status === "offen")
    .map((i) => ({
      key: `invoice-${i.id}`,
      type: "invoice",
      time: null,
      title: i.sender_name ? `${i.sender_name} – ${i.subject}` : i.subject,
      area: i.area,
      detailLabel: formatAmount(i.amount),
      raw: i,
    }));

  const eventEntries = events.map((e) => ({
    key: `event-${e.id}`,
    type: "event",
    time: e.allDay ? null : new Date(e.start),
    title: e.title,
    area: e.area,
    detailLabel: e.allDay ? "Ganztägig" : `${formatTime(new Date(e.start))} – ${formatTime(new Date(e.end))}`,
    raw: e,
  }));

  // Einträge ohne feste Uhrzeit (Aufgaben, Rechnungen, ganztägige Termine)
  // zuerst, alphabetisch - danach zeitgebundene Termine chronologisch. Eine
  // einzige Zeitleiste statt getrennter Abschnitte pro Objekttyp.
  const untimed = [...taskEntries, ...invoiceEntries, ...eventEntries.filter((e) => !e.time)].sort((a, b) =>
    a.title.localeCompare(b.title, "de"),
  );
  const timed = eventEntries.filter((e) => e.time).sort((a, b) => a.time - b.time);

  return [...untimed, ...timed];
}
