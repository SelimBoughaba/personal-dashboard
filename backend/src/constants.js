// Gemeinsame Wertebereiche für Aufgaben und Rechnungen. Müssen mit den
// CHECK-Constraints in db.js übereinstimmen. Lebensbereiche (Areas) sind
// seit der areas-Tabelle nutzerdefinierbar und stehen daher in db.js /
// areas.js, nicht hier.

export const TASK_PRIORITIES = ["niedrig", "mittel", "hoch"];
export const TASK_STATUSES = ["offen", "erledigt"];
export const INVOICE_STATUSES = ["offen", "bezahlt"];
export const CONTRACT_STATUSES = ["aktiv", "gekuendigt", "abgelaufen"];
export const CONTRACT_BILLING_CYCLES = ["monatlich", "jaehrlich", "einmalig", "sonstig"];
export const GOAL_STATUSES = ["aktiv", "erreicht", "abgebrochen"];
export const HEALTH_ENTRY_TYPES = ["gewicht", "schlaf", "sport", "sonstiges"];
export const HEALTH_ENTRY_DEFAULT_UNITS = { gewicht: "kg", schlaf: "h", sport: "min", sonstiges: "" };
