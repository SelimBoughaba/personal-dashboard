// Finanzieller Ausblick aus bekannten Verpflichtungen (Punkt 71): "Offene
// Rechnungen und wiederkehrende Verträge zu einer 30-/90-Tage-Vorschau
// verbinden; bezahlt, geplant und unbekannt trennen. Rechnung und
// zugehörigen Vertrag nicht doppelt zählen. Ohne Bankanbindung keinen
// Kontostand, keine verfügbare Liquidität und keine vollständige
// Finanzlage vortäuschen."
//
// Bewusst KEIN Kontostand/keine Liquidität: nur eine Liste bekannter
// Verpflichtungen (was fällig ist, was schon bezahlt ist, was unklar ist) -
// ohne Bankanbindung kennt diese App weder das tatsächliche Kontoguthaben
// noch sonstige Ein-/Ausgänge, würde eine solche Zahl also nur vortäuschen.
//
// "bezahlt" / "geplant" / "unbekannt" bezieht sich hier auf den Zustand
// jeder einzelnen fälligen Verpflichtung innerhalb des Zeitfensters:
//   - bezahlt: Rechnung mit Status "bezahlt", deren Fälligkeit ins Fenster fällt.
//   - geplant: offene Rechnung mit bekanntem Betrag, oder eine anhand von
//     Verlängerungsdatum/Abrechnungszyklus projizierte Vertragsfälligkeit
//     mit bekannten Kosten.
//   - unbekannt: die Verpflichtung existiert (offene Rechnung ohne Betrag,
//     aktiver Vertrag ohne Kosten oder ohne Verlängerungsdatum), aber Betrag
//     oder Zeitpunkt lassen sich nicht zuverlässig bestimmen - erscheint
//     bewusst in BEIDEN Fenstern (30 und 90 Tage), da ein fehlendes Datum
//     ein Vorkommen innerhalb keines der beiden Fenster ausschließen kann.
//
// Kein Cron: wird live bei jedem Abruf berechnet, wie computeWeek() im
// Wochenrückblick.

import { db } from "./db.js";
import { todayIso, addDays, computeNextOccurrence, nextOccurrenceAfterGap } from "./recurrence.js";

const WINDOW_DAYS = [30, 90];
const MAX_PROJECTED_OCCURRENCES = 24; // Sicherheitsnetz, wie bei der RRULE-Expansion (Section 2)
const LINKED_INVOICE_TOLERANCE_DAYS = 20; // "derselbe Abrechnungszyklus" für die Dubletten-Vermeidung

function invoiceTitle(row) {
  return row.subject || row.sender_name || "Rechnung";
}

// Liefert für einen Vertrag alle über object_links verknüpften, nicht
// gelöschten Rechnungen mit bekanntem Fälligkeitsdatum - Grundlage für die
// Dubletten-Vermeidung unten.
function linkedInvoiceDates(contractId) {
  const rows = db
    .prepare(
      `SELECT i.due_date AS due_date
       FROM object_links l
       JOIN invoices i ON i.id = CASE WHEN l.a_type = 'vertrag' THEN l.b_id ELSE l.a_id END
       WHERE ((l.a_type = 'vertrag' AND l.a_id = ? AND l.b_type = 'rechnung')
           OR (l.b_type = 'vertrag' AND l.b_id = ? AND l.a_type = 'rechnung'))
         AND i.deleted_at IS NULL AND i.due_date IS NOT NULL`,
    )
    .all(contractId, contractId);
  return rows.map((r) => r.due_date);
}

function isNearAnyDate(date, otherDates) {
  return otherDates.some((other) => Math.abs(daysBetween(date, other)) <= LINKED_INVOICE_TOLERANCE_DAYS);
}

function daysBetween(aIso, bIso) {
  const a = new Date(`${aIso}T00:00:00`);
  const b = new Date(`${bIso}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// Projiziert alle Fälligkeiten eines aktiven Vertrags zwischen heute und dem
// Horizont (dem größten der beiden Fenster). monatlich/jährlich wiederholen
// sich, einmalig/sonstig liefern höchstens das gespeicherte
// Verlängerungsdatum selbst - für "sonstig" ist der Rhythmus danach nicht
// bekannt, es wird also bewusst nicht darüber hinaus weiterprojiziert.
function projectContractDates(contract, todayStr, horizonStr) {
  if (!contract.next_renewal_date) return [];
  if (contract.next_renewal_date > horizonStr) return [];

  if (contract.billing_cycle === "einmalig" || contract.billing_cycle === "sonstig") {
    return contract.next_renewal_date >= todayStr ? [contract.next_renewal_date] : [];
  }

  const recurrence = { freq: "monthly", interval: contract.billing_cycle === "jaehrlich" ? 12 : 1 };
  let current = contract.next_renewal_date;
  if (current < todayStr) {
    current = nextOccurrenceAfterGap(current, recurrence, todayStr).next;
  }
  const dates = [];
  for (let i = 0; current <= horizonStr && i < MAX_PROJECTED_OCCURRENCES; i++) {
    dates.push(current);
    current = computeNextOccurrence(current, recurrence);
  }
  return dates;
}

export function computeFinanceOutlook() {
  const today = todayIso();
  const horizon = addDays(today, Math.max(...WINDOW_DAYS));

  const items = [];

  // Offene Rechnungen zählen unabhängig vom Alter ihres Fälligkeitsdatums
  // (auch längst überfällige sind weiterhin eine bestehende Verpflichtung).
  // Bereits bezahlte Rechnungen dagegen nur, wenn ihr Fälligkeitsdatum
  // tatsächlich in den Vorschau-Zeitraum fällt (>= heute) - sonst würde
  // jede irgendwann bezahlte Rechnung aus der Vergangenheit für immer in
  // einer angeblich vorausschauenden Ansicht auftauchen.
  const invoices = db
    .prepare(
      `SELECT * FROM invoices WHERE deleted_at IS NULL AND confirmed = 1
       AND ((status = 'offen' AND (due_date IS NULL OR due_date <= ?))
         OR (status = 'bezahlt' AND due_date >= ? AND due_date <= ?))`,
    )
    .all(horizon, today, horizon);
  for (const inv of invoices) {
    const bucket = inv.status === "bezahlt" ? "bezahlt" : inv.amount === null ? "unbekannt" : "geplant";
    items.push({
      type: "rechnung",
      id: inv.id,
      title: invoiceTitle(inv),
      area: inv.area,
      amount: inv.amount,
      date: inv.due_date,
      bucket,
    });
  }

  const contracts = db
    .prepare(`SELECT * FROM contracts WHERE deleted_at IS NULL AND status = 'aktiv'`)
    .all();
  for (const contract of contracts) {
    if (contract.cost === null) {
      // Kosten unbekannt - unabhängig vom Datum als unklare Verpflichtung
      // sichtbar machen, statt sie stillschweigend wegzulassen.
      items.push({
        type: "vertrag",
        id: contract.id,
        title: contract.title,
        area: contract.area,
        amount: null,
        date: contract.next_renewal_date,
        bucket: "unbekannt",
      });
      continue;
    }
    if (!contract.next_renewal_date) {
      items.push({ type: "vertrag", id: contract.id, title: contract.title, area: contract.area, amount: null, date: null, bucket: "unbekannt" });
      continue;
    }

    const linkedDates = linkedInvoiceDates(contract.id);
    const occurrences = projectContractDates(contract, today, horizon);
    for (const date of occurrences) {
      if (isNearAnyDate(date, linkedDates)) continue; // bereits über eine verknüpfte Rechnung gezählt
      items.push({ type: "vertrag", id: contract.id, title: contract.title, area: contract.area, amount: contract.cost, date, bucket: "geplant" });
    }
  }

  const windows = {};
  for (const days of WINDOW_DAYS) {
    const cutoff = addDays(today, days);
    const windowItems = items.filter((item) => item.date === null || item.date <= cutoff);
    windowItems.sort((a, b) => (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99"));
    windows[days] = {
      paidTotal: sumBucket(windowItems, "bezahlt"),
      plannedTotal: sumBucket(windowItems, "geplant"),
      unknownCount: windowItems.filter((i) => i.bucket === "unbekannt").length,
      items: windowItems,
    };
  }

  return { generatedAt: new Date().toISOString(), windows };
}

function sumBucket(items, bucket) {
  return items.filter((i) => i.bucket === bucket).reduce((sum, i) => sum + (i.amount || 0), 0);
}
