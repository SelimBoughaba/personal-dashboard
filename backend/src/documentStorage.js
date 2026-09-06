import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getSetting } from "./configStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __dirname = backend/src -> zwei Ebenen hoch ist das Projekt-Root, in dem
// auch der Standardwert der Einstellung "backend/data/documents" verankert ist.
const projectRoot = path.join(__dirname, "..", "..");

export function getDocumentsDir() {
  const configured = getSetting("documents.folder");
  // Ein App-Bundle ist schreibgeschützt und wird bei Updates ersetzt. Ohne
  // explizite Nutzereinstellung speichern wir Dokumente deshalb neben der
  // App-Datenbank. Der bisherige relative Pfad gilt weiter für den
  // klassischen Serverbetrieb.
  if (!configured && process.env.DASHBOARD_DATA_DIR) {
    const appDocumentsDir = path.join(path.resolve(process.env.DASHBOARD_DATA_DIR), "documents");
    fs.mkdirSync(appDocumentsDir, { recursive: true });
    return appDocumentsDir;
  }
  const storagePath = configured || "backend/data/documents";
  const resolved = path.isAbsolute(storagePath) ? storagePath : path.join(projectRoot, storagePath);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

// Erzeugt einen kollisionsfreien, dateisystemsicheren Namen für die
// Ablage auf der Platte, unabhängig vom (nutzerkontrollierten) Original-
// Dateinamen. So sind Pfad-Traversal oder Sonderzeichen im Originalnamen
// nie ein Problem.
export function generateStoredName(originalName) {
  const ext = path.extname(originalName || "").slice(0, 20).replace(/[^a-zA-Z0-9.]/g, "");
  return `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
}
