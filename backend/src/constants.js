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
export const VORGANG_STATUSES = ["aktiv", "abgeschlossen"];

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
  "vorgaenge",
];

// Kontextlinks zwischen verwandten Objekten (Punkt 69). Ein Vorgang (Punkt
// 69, voller Umfang) ist bewusst KEINE eigene Beziehungs-Engine, sondern
// selbst nur ein weiterer Typ in genau diesem System: "Bündeln" heißt
// schlicht, mehrere object_links zwischen dem Vorgang und den gebündelten
// Aufgaben/Notizen/Dokumenten/Rechnungen/Verträgen/Zielen anzulegen - "Kein
// umfangreiches Team-Projektmanagement mit Rollen, Sprints oder
// Pflichtprozessen" wird dadurch automatisch eingehalten, weil es dafür gar
// keine zusätzliche Struktur gibt. Nur Objekttypen mit einer eigenen Tabelle
// und einer id-Spalte - Termine kommen ausschließlich aus iCloud (siehe
// caldav.js) und haben keine eigene lokale Zeile, auf die eine dauerhafte
// Verknüpfung zeigen könnte.
export const LINK_OBJECT_TABLES = {
  aufgabe: { table: "tasks", titleColumn: "title" },
  rechnung: { table: "invoices", titleColumn: "subject" },
  dokument: { table: "documents", titleColumn: "title" },
  vertrag: { table: "contracts", titleColumn: "title" },
  ziel: { table: "goals", titleColumn: "title" },
  notiz: { table: "notes", titleColumn: "title" },
  vorgang: { table: "vorgaenge", titleColumn: "title" },
};
export const LINK_OBJECT_TYPES = Object.keys(LINK_OBJECT_TABLES);

// Benachrichtigungszentrum (Punkt 76). "deadline" taucht hier bewusst NICHT
// auf: Fristen werden nie in notification_events gespeichert (siehe
// notifications.js), diese Kategorien gelten nur für gespeicherte
// Ereignisse.
export const NOTIFICATION_EVENT_CATEGORIES = ["background", "integration_error"];

// Papierkorb (Punkt 77): die acht Tabellen, deren "Löschen" jetzt ein
// Soft-Delete ist (deleted_at, siehe Migration 0020) statt eines echten
// DELETE. Bewusst NICHT dabei: areas (strukturelle Konfiguration, kein
// Inhalt), health_entries (bereits sehr niedrigschwellige Einzelwerte),
// object_links (reine Verknüpfungs-Zeiger, kein eigenständiges Objekt).
// titleColumn dient nur der Anzeige im Papierkorb - bei linkedin_posts gibt
// es keinen echten Titel, "content" wird dort in trash.js gekürzt gezeigt.
export const TRASH_TABLES = {
  aufgabe: { table: "tasks", titleColumn: "title", label: "Aufgabe" },
  rechnung: { table: "invoices", titleColumn: "subject", label: "Rechnung" },
  dokument: { table: "documents", titleColumn: "title", label: "Dokument" },
  vertrag: { table: "contracts", titleColumn: "title", label: "Vertrag" },
  ziel: { table: "goals", titleColumn: "title", label: "Ziel" },
  notiz: { table: "notes", titleColumn: "title", label: "Notiz" },
  prompt: { table: "prompts", titleColumn: "title", label: "Prompt" },
  linkedin_beitrag: { table: "linkedin_posts", titleColumn: "content", label: "LinkedIn-Beitrag" },
  vorgang: { table: "vorgaenge", titleColumn: "title", label: "Vorgang" },
};
export const TRASH_TYPES = Object.keys(TRASH_TABLES);
export const TRASH_RETENTION_DAYS = 30;

// Lokaler Suchindex mit Datenschutzgrenzen (Punkt 86): genau die Felder, die
// schon die vorherige LIKE-Suche durchsucht hat - keine Ausweitung auf neue
// oder sensiblere Inhalte. Bewusst NICHT indexiert: Mail-Text (kein
// Volltext-Import von Nachrichteninhalten, siehe routes/mail.js), Gesundheits-
// werte (health_entries), Rechnungsbeträge (Zahl, kein Suchtext) und alles in
// der settings-Tabelle (Kalender-/Mail-Zugangsdaten, Passwort-Hash, JWT-
// Secret) - Geheimnisse werden hier nie indexiert. Von migrations.js
// (Migration 0025: FTS5-Tabellen + Trigger) UND routes/search.js gemeinsam
// genutzt, damit beide garantiert dieselbe Feldliste verwenden.
export const SEARCH_TABLES = [
  { table: "tasks", columns: ["title", "notes"] },
  { table: "invoices", columns: ["sender_name", "subject"] },
  { table: "documents", columns: ["title", "file_name"] },
  { table: "contracts", columns: ["title", "provider"] },
  { table: "goals", columns: ["title", "description"] },
  { table: "notes", columns: ["title", "content"] },
  { table: "prompts", columns: ["title", "content"] },
  { table: "linkedin_posts", columns: ["content"] },
  { table: "vorgaenge", columns: ["title", "description"] },
];
