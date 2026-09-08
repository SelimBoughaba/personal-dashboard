import { Router } from "express";
import { db } from "../db.js";

export const searchRouter = Router();

const LIMIT_PER_CATEGORY = 5;

// Lokaler Suchindex mit SQLite-FTS5 (Punkt 86, siehe Migration 0025 für
// Indexaufbau/-pflege). Ersetzt die vorherigen LIKE-Abfragen; dieselben
// Felder wie zuvor (siehe SEARCH_TABLES in constants.js), keine Ausweitung
// auf sensiblere Inhalte.
//
// FTS5-MATCH-Syntax erlaubt Operatoren (AND/OR/NOT/NEAR, Spaltenfilter wie
// "spalte:wort", Klammern, unausgeglichene Anführungszeichen...) - ein
// ungefiltert übernommener Nutzertext könnte damit eine ungültige/andere
// Abfrage als beabsichtigt auslösen. Jedes eingegebene Wort wird deshalb als
// eigene, in doppelte Anführungszeichen gefasste Phrase behandelt (macht es
// zu reinem Text statt FTS5-Syntax) und mit einem Sternchen zum
// Präfix-Treffer gemacht ("worte matchen alles, was mit 'wort' beginnt") -
// das kommt einer Live-Suche beim Tippen näher als ein exakter Volltreffer.
// Mehrere Wörter werden implizit UND-verknüpft (FTS5-Standardverhalten bei
// mehreren Phrasen).
function buildMatchQuery(raw) {
  const words = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8); // Sicherheitsnetz gegen absurd lange Eingaben, keine echte Rechtfertigung nötig
  if (words.length === 0) return null;
  return words.map((w) => `"${w.replace(/"/g, '""')}"*`).join(" ");
}

searchRouter.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  const matchQuery = buildMatchQuery(q);
  if (!matchQuery) return res.json([]);

  const results = [];

  // Ranking: FTS5' eingebautes bm25() (kleinerer Wert = relevanterer
  // Treffer) - keine eigene Ranking-Logik.
  function search(sql, mapRow) {
    let rows;
    try {
      rows = db.prepare(sql).all({ match: matchQuery, limit: LIMIT_PER_CATEGORY });
    } catch (err) {
      // Eine (trotz Escaping) ungültige MATCH-Abfrage darf die gesamte Suche
      // nicht abreißen lassen - diese eine Kategorie liefert dann einfach
      // keine Treffer statt eines 500ers.
      console.error("Suchindex-Abfrage fehlgeschlagen:", err);
      return;
    }
    for (const row of rows) results.push(mapRow(row));
  }

  search(
    `SELECT t.id, t.title, t.notes
     FROM tasks_fts f JOIN tasks t ON t.id = f.rowid
     WHERE tasks_fts MATCH @match AND t.deleted_at IS NULL
     ORDER BY bm25(tasks_fts) LIMIT @limit`,
    (r) => ({ type: "aufgabe", typeLabel: "Aufgabe", id: r.id, title: r.title, subtitle: r.notes || "", path: "/aufgaben" }),
  );

  search(
    `SELECT i.id, i.sender_name, i.subject
     FROM invoices_fts f JOIN invoices i ON i.id = f.rowid
     WHERE invoices_fts MATCH @match AND i.deleted_at IS NULL
     ORDER BY bm25(invoices_fts) LIMIT @limit`,
    (r) => ({
      type: "rechnung",
      typeLabel: "Rechnung",
      id: r.id,
      title: r.subject || r.sender_name || "Rechnung",
      subtitle: r.sender_name || "",
      path: "/finanzen",
    }),
  );

  search(
    `SELECT d.id, d.title, d.file_name
     FROM documents_fts f JOIN documents d ON d.id = f.rowid
     WHERE documents_fts MATCH @match AND d.deleted_at IS NULL
     ORDER BY bm25(documents_fts) LIMIT @limit`,
    (r) => ({ type: "dokument", typeLabel: "Dokument", id: r.id, title: r.title, subtitle: r.file_name, path: "/dokumente" }),
  );

  search(
    `SELECT c.id, c.title, c.provider
     FROM contracts_fts f JOIN contracts c ON c.id = f.rowid
     WHERE contracts_fts MATCH @match AND c.deleted_at IS NULL
     ORDER BY bm25(contracts_fts) LIMIT @limit`,
    (r) => ({
      type: "vertrag",
      typeLabel: "Vertrag",
      id: r.id,
      title: r.title,
      subtitle: r.provider || "",
      path: "/vertraege",
    }),
  );

  search(
    `SELECT g.id, g.title, g.description
     FROM goals_fts f JOIN goals g ON g.id = f.rowid
     WHERE goals_fts MATCH @match AND g.deleted_at IS NULL
     ORDER BY bm25(goals_fts) LIMIT @limit`,
    (r) => ({ type: "ziel", typeLabel: "Ziel", id: r.id, title: r.title, subtitle: r.description || "", path: "/ziele" }),
  );

  search(
    `SELECT n.id, n.title, n.content
     FROM notes_fts f JOIN notes n ON n.id = f.rowid
     WHERE notes_fts MATCH @match AND n.deleted_at IS NULL
     ORDER BY bm25(notes_fts) LIMIT @limit`,
    (r) => ({
      type: "notiz",
      typeLabel: "Notiz",
      id: r.id,
      title: r.title || "(ohne Titel)",
      subtitle: (r.content || "").slice(0, 80),
      path: "/notizen",
    }),
  );

  search(
    `SELECT p.id, p.title, p.content
     FROM prompts_fts f JOIN prompts p ON p.id = f.rowid
     WHERE prompts_fts MATCH @match AND p.deleted_at IS NULL
     ORDER BY bm25(prompts_fts) LIMIT @limit`,
    (r) => ({
      type: "prompt",
      typeLabel: "Prompt",
      id: r.id,
      title: r.title,
      subtitle: (r.content || "").slice(0, 80),
      path: "/prompts",
    }),
  );

  search(
    `SELECT l.id, l.content
     FROM linkedin_posts_fts f JOIN linkedin_posts l ON l.id = f.rowid
     WHERE linkedin_posts_fts MATCH @match AND l.deleted_at IS NULL
     ORDER BY bm25(linkedin_posts_fts) LIMIT @limit`,
    (r) => ({
      type: "linkedin",
      typeLabel: "LinkedIn-Beitrag",
      id: r.id,
      title: (r.content || "").slice(0, 60) || "(leerer Beitrag)",
      subtitle: "",
      path: "/linkedin",
    }),
  );

  search(
    `SELECT v.id, v.title, v.description
     FROM vorgaenge_fts f JOIN vorgaenge v ON v.id = f.rowid
     WHERE vorgaenge_fts MATCH @match AND v.deleted_at IS NULL
     ORDER BY bm25(vorgaenge_fts) LIMIT @limit`,
    (r) => ({
      type: "vorgang",
      typeLabel: "Vorgang",
      id: r.id,
      title: r.title,
      subtitle: r.description || "",
      path: "/vorgaenge",
    }),
  );

  res.json(results);
});
