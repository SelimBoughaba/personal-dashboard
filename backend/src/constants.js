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
export const GOAL_REVIEW_FREQS = ["monthly", "quarterly", "yearly"];
export const HEALTH_ENTRY_TYPES = ["gewicht", "schlaf", "sport", "sonstiges"];
export const HEALTH_ENTRY_DEFAULT_UNITS = { gewicht: "kg", schlaf: "h", sport: "min", sonstiges: "" };
export const LINKEDIN_POST_STATUSES = ["entwurf", "geplant", "veroeffentlicht"];

// Alle Tabellen, die eine "area"-Spalte mit einer Fremdschlüssel-artigen
// Beziehung zu areas.id besitzen (kein echter FK-Constraint, da Bereiche
// nutzerdefinierbar sind – siehe migrations.js #0001). Zentral gepflegt,
// damit Bereichslöschung/-archivierung (routes/areas.js) und die
// Waisen-Reparatur-Migration (migrations.js #0013) garantiert dieselbe
// Liste verwenden, statt an zwei Stellen unabhängig gepflegt zu werden.
export const AREA_OWNED_TABLES = [
  "tasks",
  "invoices",
  "documents",
  "contracts",
  "goals",
  "notes",
  "prompts",
  "linkedin_posts",
];

// Kontextlinks zwischen verwandten Objekten (Punkt 69, Teilumfang: sichtbare,
// manuell gepflegte Beziehungen statt eines vollen Vorgangs-/Projektmodells).
// Nur Objekttypen mit einer eigenen Tabelle und einer id-Spalte - Termine
// kommen ausschließlich aus iCloud (siehe caldav.js) und haben keine eigene
// lokale Zeile, auf die eine dauerhafte Verknüpfung zeigen könnte.
export const LINK_OBJECT_TABLES = {
  aufgabe: { table: "tasks", titleColumn: "title" },
  rechnung: { table: "invoices", titleColumn: "subject" },
  dokument: { table: "documents", titleColumn: "title" },
  vertrag: { table: "contracts", titleColumn: "title" },
  ziel: { table: "goals", titleColumn: "title" },
  notiz: { table: "notes", titleColumn: "title" },
};
export const LINK_OBJECT_TYPES = Object.keys(LINK_OBJECT_TABLES);
