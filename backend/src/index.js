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
import { promptsRouter } from "./routes/prompts.js";
import { linkedinPostsRouter } from "./routes/linkedinPosts.js";
import { linksRouter } from "./routes/links.js";
import { weekReviewsRouter } from "./routes/weekReviews.js";
import { notificationsRouter } from "./routes/notifications.js";
import { trashRouter } from "./routes/trash.js";
import { requireAuth } from "./middleware/auth.js";
import { db } from "./db.js";

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

// Express nutzt standardmäßig ("extended") die qs-Bibliothek für
// req.query, die aktuell zwei moderate Sicherheitslücken hat (Array-Limit-
// Umgehung, DoS über kontrollierbares isBuffer) - ein Fix ist nur über ein
// Major-Update auf Express 5 verfügbar (npm audit). Diese App nutzt an
// keiner Stelle qs' erweiterte Syntax (verschachtelte Objekte/Arrays wie
// "?filter[x]=y") - alle Query-Parameter sind flache Schlüssel/Wert-Paare
// (z. B. ?area=alle&status=alle). "simple" verwendet stattdessen Node's
// eingebautes querystring-Modul und ist damit von den qs-Advisories gar
// nicht erst betroffen, ohne dass Express selbst aktualisiert werden muss.
app.set("query parser", "simple");

// Kein CORS-Middleware nötig: Frontend und Backend laufen immer same-origin
// (im Dev-Modus per Vite-Proxy, im Produktivbetrieb liefert dieser Server
// das Frontend selbst mit aus). Weniger Angriffsfläche als offenes CORS.
// hsts:false, da diese App nur über unverschlüsseltes HTTP im lokalen Netz
// läuft: der Standard-HSTS-Header von helmet kann sonst im Browser eine
// dauerhafte "immer HTTPS erzwingen"-Regel für den Hostnamen hinterlassen,
// die jede spätere (unverschlüsselte) Verbindung zur App blockiert.
const helmetOptions = { hsts: false };
// WKWebView lädt das Dashboard bewusst über einen ausschließlich lokalen
// HTTP-Server. WebKit wertet Helmets `upgrade-insecure-requests` strenger
// als normale Browser aus und würde dabei lokale JS-/CSS-Dateien auf eine
// nicht vorhandene HTTPS-Adresse umschreiben.
if (process.env.DISABLE_HTTPS_UPGRADE === "1") {
  helmetOptions.contentSecurityPolicy = {
    directives: { "upgrade-insecure-requests": null },
  };
}
app.use(helmet(helmetOptions));
app.use(compression());

// Die native macOS-Hülle startet den Server auf einem zufälligen Port und
// wartet auf eine 200-Antwort hier, bevor sie den WebView darauf zeigt. Ein
// beliebiger anderer Prozess, der zufällig denselben Port belegt und selbst
// mit 200 antwortet, würde ohne dieses Token fälschlich als "eigener
// Server" durchgehen. DASHBOARD_INSTANCE_TOKEN wird nur von der nativen
// Hülle gesetzt (ein pro Start neu erzeugtes Zufallstoken) - im normalen
// Server-/Testbetrieb ist die Variable leer und die Antwort bleibt wie
// bisher.
const instanceToken = process.env.DASHBOARD_INSTANCE_TOKEN || null;
app.get("/api/health", (req, res) => {
  res.json(instanceToken ? { ok: true, instanceToken } : { ok: true });
});

// backupRouter bringt für POST /preview und /restore einen eigenen, größeren
// JSON-Parser mit (ein vollständiges Backup kann das globale 1-MB-Limit
// unten sprengen). Deshalb muss dieser Router VOR dem globalen
// express.json() montiert werden, sonst hätte der globale Parser den Body
// bereits verarbeitet (bzw. bei Überschreitung des 1-MB-Limits abgelehnt),
// bevor backupRouter überhaupt zum Zug kommt. requireAuth liest nur den
// Authorization-Header und braucht dafür keinen geparsten Body.
app.use("/api/backup", requireAuth, backupRouter);

app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/calendar", requireAuth, calendarRouter);
app.use("/api/mail", requireAuth, mailRouter);
app.use("/api/invoices", requireAuth, invoicesRouter);
app.use("/api/areas", requireAuth, areasRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api/documents", requireAuth, documentsRouter);
app.use("/api/contracts", requireAuth, contractsRouter);
app.use("/api/goals", requireAuth, goalsRouter);
app.use("/api/notes", requireAuth, notesRouter);
app.use("/api/health-entries", requireAuth, healthRouter);
app.use("/api/search", requireAuth, searchRouter);
app.use("/api/prompts", requireAuth, promptsRouter);
app.use("/api/linkedin-posts", requireAuth, linkedinPostsRouter);
app.use("/api/links", requireAuth, linksRouter);
app.use("/api/week-reviews", requireAuth, weekReviewsRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);
app.use("/api/trash", requireAuth, trashRouter);

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

export { app };

// Nur lauschen, wenn diese Datei direkt gestartet wird (npm start/dev) –
// nicht, wenn sie (z. B. von Tests) importiert wird, um die fertig
// konfigurierte app-Instanz gegen eine eigene, isolierte Testdatenbank
// laufen zu lassen.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 4000;
  const host = process.env.HOST || "0.0.0.0";
  const server = app.listen(port, host, () => {
    console.log(`Dashboard-Server läuft auf http://${host}:${port}`);
  });

  // Ohne das hier wird SQLite (WAL-Modus) beim Beenden nie sauber
  // geschlossen: der letzte Checkpoint bleibt aus, und -wal/-shm-Dateien
  // können bei einem harten Kill wachsen, statt in die Hauptdatei
  // zusammengeführt zu werden. Neue Verbindungen zuerst stoppen (server
  // .close), erst danach die Datenbank schließen, damit keine Anfrage
  // mitten in einer offenen Transaktion abgeschnitten wird.
  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} empfangen, fahre herunter…`);
    server.close(() => {
      try {
        db.close();
      } catch (err) {
        console.error("Fehler beim Schließen der Datenbank:", err);
      }
      process.exit(0);
    });
    // Falls eine hängende Verbindung server.close() blockiert (z. B. ein
    // langsamer IMAP-/CalDAV-Request), nach kurzer Frist trotzdem beenden,
    // statt beim nativen macOS-Neustart/-Update unbegrenzt zu warten.
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Nur relevant unter der nativen macOS-Hülle (erkennbar am Instanztoken):
  // Stirbt der übergeordnete Swift-Prozess nicht sauber (Absturz, "Kill
  // erzwingen" im Activity Monitor), bekommt dieser Kindprozess nie
  // applicationWillTerminate/SIGTERM mit und würde als Waise unbegrenzt
  // weiterlaufen und den Port belegt halten. Unter POSIX wird ein
  // verwaister Prozess auf einen neuen Elternprozess (i. d. R. launchd,
  // PID 1) umgehängt - das lässt sich durch Polling von process.ppid
  // erkennen, ohne dass das Betriebssystem uns aktiv benachrichtigen muss.
  // Im normalen Server-/Testbetrieb (kein Instanztoken) bleibt das aus,
  // damit z. B. ein Terminal-Tab-Wechsel im Dev-Modus nicht fälschlich als
  // Elternwechsel gilt.
  if (instanceToken) {
    const parentPidAtStart = process.ppid;
    const watchdog = setInterval(() => {
      if (process.ppid !== parentPidAtStart) {
        console.log(
          "Übergeordneter Prozess (native Hülle) nicht mehr vorhanden – beende, um keinen verwaisten Serverprozess zu hinterlassen.",
        );
        shutdown("PARENT_GONE");
      }
    }, 5000);
    watchdog.unref();
  }
}
