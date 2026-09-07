import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getSetting } from "./configStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname = backend/src -> zwei Ebenen hoch ist das Projekt-Root, in dem
// auch der Standardwert der Einstellung "backend/data/documents" verankert ist.
const projectRoot = path.join(__dirname, "..", "..");

// Reine Pfadauflösung ohne Seiteneffekt (kein Anlegen des Ordners, keine
// Einstellung wird gelesen/verändert) - wird sowohl von getDocumentsDir()
// als auch von der Ordnerwechsel-Migration in routes/settings.js genutzt,
// um VOR einer Änderung zu wissen, wo der neue Ordner läge.
export function resolveDocumentsDirFor(configured) {
  // Ein App-Bundle ist schreibgeschützt und wird bei Updates ersetzt. Ohne
  // explizite Nutzereinstellung speichern wir Dokumente deshalb neben der
  // App-Datenbank. Der bisherige relative Pfad gilt weiter für den
  // klassischen Serverbetrieb.
  if (!configured && process.env.DASHBOARD_DATA_DIR) {
    return path.join(path.resolve(process.env.DASHBOARD_DATA_DIR), "documents");
  }
  const storagePath = configured || "backend/data/documents";
  return path.isAbsolute(storagePath) ? storagePath : path.join(projectRoot, storagePath);
}

export function getDocumentsDir() {
  const resolved = resolveDocumentsDirFor(getSetting("documents.folder"));
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

// Muss exakt zu generateStoredName() unten passen. Zentral definiert, damit
// jede Stelle, die stored_name in einen Dateisystempfad einsetzt (Download,
// Löschen, Backup-Wiederherstellung), dasselbe strenge Format prüfen kann,
// statt dem Wert aus der Datenbank blind zu vertrauen.
export const STORED_NAME_PATTERN = /^\d+-[0-9a-f]{16}(\.[a-zA-Z0-9]{1,20})?$/;

// Erzeugt einen kollisionsfreien, dateisystemsicheren Namen für die
// Ablage auf der Platte, unabhängig vom (nutzerkontrollierten) Original-
// Dateinamen. So sind Pfad-Traversal oder Sonderzeichen im Originalnamen
// nie ein Problem.
export function generateStoredName(originalName) {
  let ext = path.extname(originalName || "").slice(0, 20).replace(/[^a-zA-Z0-9.]/g, "");
  // Ein Originalname wie "readme." liefert von path.extname() nur ".";
  // ohne mindestens ein Zeichen dahinter wäre das Ergebnis nicht mehr
  // STORED_NAME_PATTERN-konform.
  if (ext.length <= 1) ext = "";
  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  return name;
}

// Löst stored_name sicher zu einem absoluten Pfad innerhalb des aktuell
// konfigurierten Dokumentenordners auf, oder gibt null zurück. Zwei
// unabhängige Prüfungen (Format + tatsächliches Enthaltensein im
// aufgelösten Zielordner) statt nur einer, an jeder Stelle, die diese Datei
// tatsächlich anfasst (Download, Löschen, Restore-Validierung in
// backupSchemas.js) – nicht nur beim Upload.
export function resolveStoredDocumentPath(storedName) {
  if (typeof storedName !== "string" || !STORED_NAME_PATTERN.test(storedName)) return null;
  const dir = path.resolve(getDocumentsDir());
  const resolved = path.resolve(dir, storedName);
  if (resolved !== dir && !resolved.startsWith(dir + path.sep)) return null;
  return resolved;
}
