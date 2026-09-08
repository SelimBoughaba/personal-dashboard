import { Router } from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import { db, isValidArea, getDefaultAreaId } from "../db.js";
import { getDocumentsDir, generateStoredName, resolveStoredDocumentPath } from "../documentStorage.js";

export const documentsRouter = Router();

// Sichere Vorschau (Punkt 72): NUR für ein festes, geprüftes Allowlist an
// Formaten - nie für den vom Client behaupteten mime_type. Ein Angreifer
// könnte beim Upload einen beliebigen Content-Type für die Datei angeben
// (z. B. eine HTML-Datei als "image/png" deklarieren); ohne echte Prüfung
// der tatsächlichen Dateibytes könnte eine so getarnte Datei inline im
// selben Origin wie die App gerendert werden - klassisches Einfallstor für
// gespeichertes XSS. Bewusst KEIN image/svg+xml in der Allowlist: SVG darf
// eingebettetes JavaScript enthalten, das beim Rendern via <embed>/<iframe>
// im selben Origin ausgeführt würde. PDFs werden von Browsern in einer
// eigenen, skriptfreien Vorschau gerendert.
function sniffPreviewMimeType(filePath) {
  let buf;
  try {
    const fd = fs.openSync(filePath, "r");
    buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
  } catch {
    return null;
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, getDocumentsDir());
    },
    filename(req, file, cb) {
      cb(null, generateStoredName(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serialize(row) {
  return { ...row, tags: parseTags(row.tags) };
}

documentsRouter.get("/", (req, res) => {
  const { area, tag, q } = req.query;
  let query = "SELECT * FROM documents";
  const clauses = ["deleted_at IS NULL"];
  const params = [];

  if (area && area !== "alle") {
    clauses.push("area = ?");
    params.push(area);
  }
  if (tag) {
    clauses.push("tags LIKE ?");
    params.push(`%"${tag}"%`);
  }
  if (q) {
    clauses.push("(title LIKE ? OR file_name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (clauses.length) query += " WHERE " + clauses.join(" AND ");
  query += " ORDER BY created_at DESC";

  res.json(db.prepare(query).all(...params).map(serialize));
});

documentsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Keine Datei übermittelt." });

  const area = req.body.area || getDefaultAreaId();
  if (!isValidArea(area)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "Ungültiger Bereich." });
  }

  let tags = [];
  try {
    tags = req.body.tags ? JSON.parse(req.body.tags) : [];
    if (!Array.isArray(tags)) tags = [];
  } catch {
    tags = [];
  }

  // Dateiduplikathinweise anhand Hash (Punkt 72): reiner Hinweis, kein
  // automatisches Zusammenführen oder Verhindern des Uploads - "unterschiedliche
  // Dateiversionen nicht automatisch zusammenführen oder löschen, Original
  // bleibt erhalten". Beide Dateien bleiben unabhängig bestehen, der Nutzer
  // entscheidet selbst.
  let sha256 = null;
  try {
    sha256 = await hashFile(req.file.path);
  } catch (err) {
    console.error(`Dokument-Upload: Hash konnte nicht berechnet werden (${req.file.path}):`, err);
  }
  const duplicate = sha256
    ? db.prepare("SELECT id, title FROM documents WHERE sha256 = ? AND deleted_at IS NULL").get(sha256)
    : null;

  const stmt = db.prepare(`
    INSERT INTO documents (title, file_name, stored_name, mime_type, size, area, tags, sha256)
    VALUES (@title, @file_name, @stored_name, @mime_type, @size, @area, @tags, @sha256)
  `);

  let info;
  try {
    info = stmt.run({
      title: (req.body.title || req.file.originalname || "Dokument").trim(),
      file_name: req.file.originalname,
      stored_name: req.file.filename,
      mime_type: req.file.mimetype || "",
      size: req.file.size,
      area,
      tags: JSON.stringify(tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())),
      sha256,
    });
  } catch (err) {
    // multer hat die Datei bereits auf die Platte geschrieben, bevor dieser
    // Handler lief. Schlägt der DB-Insert fehl (z. B. eine künftige
    // Constraint-Verletzung), bliebe ohne diesen Block eine Datei ohne
    // jeden Datenbankeintrag auf der Platte liegen - nie auffindbar, nie
    // löschbar über die App.
    fs.unlink(req.file.path, () => {});
    console.error("Dokument-Upload: DB-Insert fehlgeschlagen, hochgeladene Datei entfernt:", err);
    return res.status(500).json({ error: "Dokument konnte nicht gespeichert werden." });
  }

  const created = serialize(db.prepare("SELECT * FROM documents WHERE id = ?").get(info.lastInsertRowid));
  res.status(201).json(duplicate ? { ...created, duplicateOf: duplicate } : created);
});

documentsRouter.get("/:id/download", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden." });

  // stored_name kommt aus der DB, nicht direkt vom Client – trotzdem wird
  // hier erneut geprüft (Format + tatsächliches Enthaltensein im
  // konfigurierten Speicherordner), statt der Datenbank blind zu vertrauen.
  // Ein manipulierter oder wiederhergestellter Datensatz mit unerwartetem
  // stored_name darf nie zu einem Dateizugriff außerhalb des Ordners führen.
  const filePath = resolveStoredDocumentPath(doc.stored_name);
  if (!filePath) {
    console.error(`Dokument ${doc.id}: ungültiger stored_name "${doc.stored_name}", Download verweigert.`);
    return res.status(500).json({ error: "Dokument ist beschädigt (ungültiger Dateiverweis)." });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei fehlt auf der Platte (wurde außerhalb der App gelöscht?)." });
  }
  res.download(filePath, doc.file_name);
});

// Sichere Inline-Vorschau (Punkt 72) - siehe sniffPreviewMimeType() oben für
// die Begründung, warum hier nie der gespeicherte mime_type verwendet wird.
// Nicht erkannte Formate liefern bewusst 415 statt eines Downloads: die
// Vorschau ist eine eigene, engere Funktion als der Download, kein Fallback
// dafür.
documentsRouter.get("/:id/preview", (req, res) => {
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden." });

  const filePath = resolveStoredDocumentPath(doc.stored_name);
  if (!filePath) {
    console.error(`Dokument ${doc.id}: ungültiger stored_name "${doc.stored_name}", Vorschau verweigert.`);
    return res.status(500).json({ error: "Dokument ist beschädigt (ungültiger Dateiverweis)." });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Datei fehlt auf der Platte (wurde außerhalb der App gelöscht?)." });
  }

  const sniffed = sniffPreviewMimeType(filePath);
  if (!sniffed) {
    return res.status(415).json({ error: "Für diesen Dateityp gibt es keine Vorschau. Bitte herunterladen." });
  }

  res.setHeader("Content-Type", sniffed);
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "private, max-age=0, no-cache");
  fs.createReadStream(filePath).pipe(res);
});

documentsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Dokument nicht gefunden." });

  const body = req.body || {};
  if (body.area !== undefined && !isValidArea(body.area)) {
    return res.status(400).json({ error: "Ungültiger Bereich." });
  }

  const merged = {
    id: req.params.id,
    title: body.title !== undefined ? String(body.title).trim() || existing.title : existing.title,
    area: body.area ?? existing.area,
    tags:
      body.tags !== undefined
        ? JSON.stringify(Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === "string" && t.trim()) : [])
        : existing.tags,
  };

  db.prepare(`
    UPDATE documents SET title=@title, area=@area, tags=@tags, updated_at=datetime('now') WHERE id=@id
  `).run(merged);

  res.json(serialize(db.prepare("SELECT * FROM documents WHERE id = ?").get(req.params.id)));
});

documentsRouter.delete("/:id", (req, res) => {
  // Papierkorb (Punkt 77): Soft-Delete statt echtem DELETE - die Datei
  // bleibt bewusst auf der Platte liegen (siehe trash.js), solange der
  // Datensatz wiederherstellbar ist. Nur das endgültige Löschen im
  // Papierkorb (routes/trash.js) entfernt die Datei wirklich.
  const info = db
    .prepare("UPDATE documents SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Dokument nicht gefunden." });
  res.status(204).send();
});

// Multer-Fehler (z. B. Datei zu groß) landen sonst in der generischen
// 500er-Fehlerbehandlung ohne hilfreiche Meldung.
documentsRouter.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload fehlgeschlagen: ${err.message}` });
  }
  next(err);
});
