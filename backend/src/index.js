import "dotenv/config";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { logStartupStatus } from "./startupChecks.js";
import { authRouter } from "./routes/auth.js";
import { tasksRouter } from "./routes/tasks.js";
import { calendarRouter } from "./routes/calendar.js";
import { mailRouter } from "./routes/mail.js";
import { invoicesRouter } from "./routes/invoices.js";
import { areasRouter } from "./routes/areas.js";
import { settingsRouter } from "./routes/settings.js";
import { backupRouter } from "./routes/backup.js";
import { documentsRouter } from "./routes/documents.js";
import { contractsRouter } from "./routes/contracts.js";
import { goalsRouter } from "./routes/goals.js";
import { notesRouter } from "./routes/notes.js";
import { healthRouter } from "./routes/health.js";
import { searchRouter } from "./routes/search.js";
import { requireAuth } from "./middleware/auth.js";

logStartupStatus();

// Ein einzelner unbehandelter Fehler irgendwo (z. B. ein Promise-Reject in
// einer Bibliothek) soll nicht den ganzen Server mitreißen – Node beendet
// den Prozess bei unhandledRejection sonst standardmäßig.
process.on("unhandledRejection", (reason) => {
  console.error("Unbehandelte Promise-Ablehnung:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Unbehandelte Ausnahme:", err);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Kein CORS-Middleware nötig: Frontend und Backend laufen immer same-origin
// (im Dev-Modus per Vite-Proxy, im Produktivbetrieb liefert dieser Server
// das Frontend selbst mit aus). Weniger Angriffsfläche als offenes CORS.
// HSTS (hsts:false) bewusst deaktiviert: Diese App läuft ausschließlich über
// unverschlüsseltes HTTP im lokalen Netz und wird nie über HTTPS bereitgestellt.
// Ein HSTS-Header hat hier keinen Nutzen und kann im Browser eine dauerhafte
// "immer HTTPS erzwingen"-Regel für den Hostnamen hinterlassen, die dann jede
// künftige (unverschlüsselte) Verbindung zur App mit einem TLS-Fehler blockiert.
app.use(helmet({ hsts: false }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/calendar", requireAuth, calendarRouter);
app.use("/api/mail", requireAuth, mailRouter);
app.use("/api/invoices", requireAuth, invoicesRouter);
app.use("/api/areas", requireAuth, areasRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/backup", requireAuth, backupRouter);
app.use("/api/documents", requireAuth, documentsRouter);
app.use("/api/contracts", requireAuth, contractsRouter);
app.use("/api/goals", requireAuth, goalsRouter);
app.use("/api/notes", requireAuth, notesRouter);
app.use("/api/health-entries", requireAuth, healthRouter);
app.use("/api/search", requireAuth, searchRouter);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Nicht gefunden." });
});

// Im lokalen Betrieb wird das gebaute Frontend mitausgeliefert,
// damit auf dem iPhone nur eine Adresse (Mac-IP:Port) nötig ist.
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// Zentrale Fehlerbehandlung: fängt sowohl synchrone Throws in Routen als
// auch von Express selbst erkannte Fehler (z. B. kaputtes JSON im Body-
// Parser) ab. Gibt nie einen Stacktrace an den Client zurück.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Unbehandelter Request-Fehler:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: "Es ist ein unerwarteter Fehler aufgetreten." });
});

const port = process.env.PORT || 4000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Dashboard-Server läuft auf http://0.0.0.0:${port}`);
});
