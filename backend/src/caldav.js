import { createDAVClient } from "tsdav";
import ical from "node-ical";

const CALENDAR_CACHE_MS = 5 * 60 * 1000;

let cachedClient = null;
let cachedCalendars = null;
let calendarsCachedAt = 0;

async function getClient() {
  if (cachedClient) return cachedClient;
  cachedClient = await createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: {
      username: process.env.ICLOUD_USERNAME,
      password: process.env.ICLOUD_APP_PASSWORD,
    },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  return cachedClient;
}

async function getCalendars() {
  const now = Date.now();
  if (cachedCalendars && now - calendarsCachedAt < CALENDAR_CACHE_MS) {
    return cachedCalendars;
  }
  const client = await getClient();
  cachedCalendars = await client.fetchCalendars();
  calendarsCachedAt = now;
  return cachedCalendars;
}

function parseAreaMap() {
  try {
    return JSON.parse(process.env.CALENDAR_AREA_MAP || "{}");
  } catch {
    console.warn("CALENDAR_AREA_MAP ist kein gültiges JSON – ignoriere Bereichs-Zuordnung.");
    return {};
  }
}

function areaForCalendar(calendarName, areaMap) {
  return areaMap[calendarName] || "allgemein";
}

// Wiederkehrende Termine (RRULE) auf einzelne Vorkommen im angefragten
// Zeitraum auflösen, inkl. Ausnahmen (EXDATE) und Einzeländerungen
// (RECURRENCE-ID), wie von node-ical geparst.
function expandEvent(event, rangeStart, rangeEnd) {
  if (!event.rrule) {
    const start = event.start;
    const end = event.end || event.start;
    if (start < rangeEnd && end > rangeStart) {
      return [{ start, end, summary: event.summary }];
    }
    return [];
  }

  const durationMs = event.end ? event.end.getTime() - event.start.getTime() : 0;
  const exceptionDates = event.exdate ? Object.keys(event.exdate) : [];
  const occurrences = [];

  for (const date of event.rrule.between(rangeStart, rangeEnd, true)) {
    const iso = date.toISOString().slice(0, 10);
    if (exceptionDates.some((d) => d.startsWith(iso))) continue;

    const override = event.recurrences
      ? Object.entries(event.recurrences).find(([key]) => key.startsWith(iso))
      : null;

    if (override) {
      const [, ov] = override;
      occurrences.push({ start: ov.start, end: ov.end || ov.start, summary: ov.summary || event.summary });
    } else {
      occurrences.push({ start: date, end: new Date(date.getTime() + durationMs), summary: event.summary });
    }
  }
  return occurrences;
}

export async function getEvents({ from, to }) {
  const areaMap = parseAreaMap();
  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);

  const client = await getClient();
  const calendars = await getCalendars();
  const results = [];

  for (const calendar of calendars) {
    const objects = await client.fetchCalendarObjects({
      calendar,
      timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    });

    for (const obj of objects) {
      if (!obj.data) continue;

      let parsed;
      try {
        parsed = ical.parseICS(obj.data);
      } catch {
        continue;
      }

      for (const event of Object.values(parsed)) {
        if (event.type !== "VEVENT" || !event.start) continue;

        for (const occ of expandEvent(event, rangeStart, rangeEnd)) {
          results.push({
            id: `${event.uid}-${occ.start.toISOString()}`,
            title: occ.summary || "(Ohne Titel)",
            start: occ.start.toISOString(),
            end: occ.end.toISOString(),
            allDay: event.datetype === "date",
            location: event.location || null,
            calendar: calendar.displayName,
            area: areaForCalendar(calendar.displayName, areaMap),
          });
        }
      }
    }
  }

  results.sort((a, b) => a.start.localeCompare(b.start));
  return results;
}
