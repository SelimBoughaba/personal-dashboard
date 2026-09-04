import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { authRouter } from "./routes/auth.js";
import { tasksRouter } from "./routes/tasks.js";
import { calendarRouter } from "./routes/calendar.js";
import { mailRouter } from "./routes/mail.js";
import { requireAuth } from "./middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/calendar", requireAuth, calendarRouter);
app.use("/api/mail", requireAuth, mailRouter);

// Im lokalen Betrieb wird das gebaute Frontend mitausgeliefert,
// damit auf dem iPhone nur eine Adresse (Mac-IP:Port) nötig ist.
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const port = process.env.PORT || 4000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Dashboard-Server läuft auf http://0.0.0.0:${port}`);
});
