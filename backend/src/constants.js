// Gemeinsame Wertebereiche für Aufgaben und Rechnungen. Müssen mit den
// CHECK-Constraints in db.js übereinstimmen. Lebensbereiche (Areas) sind
// seit der areas-Tabelle nutzerdefinierbar und stehen daher in db.js /
// areas.js, nicht hier.

export const TASK_PRIORITIES = ["niedrig", "mittel", "hoch"];
export const TASK_STATUSES = ["offen", "erledigt"];
export const INVOICE_STATUSES = ["offen", "bezahlt"];
