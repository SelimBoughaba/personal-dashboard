import { Router } from "express";
import { db } from "../db.js";

export const searchRouter = Router();

const LIMIT_PER_CATEGORY = 5;

searchRouter.get("/", (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);
  const like = `%${q}%`;

  const results = [];

  db.prepare("SELECT id, title, notes FROM tasks WHERE title LIKE ? OR notes LIKE ? LIMIT ?")
    .all(like, like, LIMIT_PER_CATEGORY)
    .forEach((r) =>
      results.push({ type: "aufgabe", typeLabel: "Aufgabe", id: r.id, title: r.title, subtitle: r.notes || "", path: "/aufgaben" }),
    );

  db.prepare("SELECT id, sender_name, subject FROM invoices WHERE sender_name LIKE ? OR subject LIKE ? LIMIT ?")
    .all(like, like, LIMIT_PER_CATEGORY)
    .forEach((r) =>
      results.push({
        type: "rechnung",
        typeLabel: "Rechnung",
        id: r.id,
        title: r.subject || r.sender_name || "Rechnung",
        subtitle: r.sender_name || "",
        path: "/finanzen",
      }),
    );

  db.prepare("SELECT id, title, file_name FROM documents WHERE title LIKE ? OR file_name LIKE ? LIMIT ?")
    .all(like, like, LIMIT_PER_CATEGORY)
    .forEach((r) =>
      results.push({ type: "dokument", typeLabel: "Dokument", id: r.id, title: r.title, subtitle: r.file_name, path: "/dokumente" }),
    );

  db.prepare("SELECT id, title, provider FROM contracts WHERE title LIKE ? OR provider LIKE ? LIMIT ?")
    .all(like, like, LIMIT_PER_CATEGORY)
    .forEach((r) =>
      results.push({
        type: "vertrag",
        typeLabel: "Vertrag",
        id: r.id,
        title: r.title,
        subtitle: r.provider || "",
        path: "/vertraege",
      }),
    );

  db.prepare("SELECT id, title, description FROM goals WHERE title LIKE ? OR description LIKE ? LIMIT ?")
    .all(like, like, LIMIT_PER_CATEGORY)
    .forEach((r) =>
      results.push({ type: "ziel", typeLabel: "Ziel", id: r.id, title: r.title, subtitle: r.description || "", path: "/ziele" }),
    );

  db.prepare("SELECT id, title, content FROM notes WHERE title LIKE ? OR content LIKE ? LIMIT ?")
    .all(like, like, LIMIT_PER_CATEGORY)
    .forEach((r) =>
      results.push({
        type: "notiz",
        typeLabel: "Notiz",
        id: r.id,
        title: r.title || "(ohne Titel)",
        subtitle: (r.content || "").slice(0, 80),
        path: "/notizen",
      }),
    );

  res.json(results);
});
