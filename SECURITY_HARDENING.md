# Sicherheits- und Zuverlässigkeitshärtung – Statusbericht

Dieser Bericht dokumentiert, was aus dem 94-Punkte-Verbesserungsprompt vom
7. September 2026 in dieser Runde tatsächlich umgesetzt, getestet und
verifiziert wurde – und was bewusst zurückgestellt wurde. Ehrlich gesagt:
**94 Punkte sind kein Ein-Sitzungs-Umfang.** Umgesetzt wurde eine
vollständige, getestete erste Tranche aus Abschnitt 1 (Sicherheit/Restore)
plus der eine konkrete, bestätigte Bug aus Abschnitt 2 (Kalendertrennung).
Alles andere steht unten explizit als offen.

Hinweis zur Herkunft des Prompts: Er nennt als Zielprojekt einen lokalen
Pfad (`/Users/selim/.codex/...`) sowie einen Prüfbericht, auf die von dieser
Cloud-Sitzung aus kein Zugriff besteht. Umgesetzt wurde daher gegen den
tatsächlichen Code in diesem Repository (`SelimBoughaba/personal-dashboard`),
nicht gegen den referenzierten (hier nicht einsehbaren) Prüfbericht.

## Umgesetzt und automatisiert getestet

Alle Punkte unten sind durch `backend/test/security.test.js` abgedeckt
(`cd backend && npm test`, 15 Tests, alle grün) **und** zusätzlich manuell
per Live-Server gegenprobiert (curl gegen einen frischen Server).

| # | Punkt | Was geändert wurde |
|---|---|---|
| 1 | Dokumentpfade absichern | `documentStorage.js#resolveStoredDocumentPath`: Format-Check (Regex, exakt das was `generateStoredName` erzeugt) **plus** Enthaltenseins-Check im aufgelösten Pfad – an Download, Löschen **und** Backup-Restore-Validierung (nicht nur beim Upload). |
| 2 | Restore strikt typisieren | Neue `backend/src/backupSchemas.js` (zod): jede Tabelle hat ein vollständiges Schema (Typen, Enums, Zahlenbereiche, echte Kalendertage, Bereichsreferenzen). Vorschau und Restore nutzen dieselbe Validierung. `confirm` muss literal `true` sein (war vorher nur „truthy"). Fehlermeldungen nennen Tabelle/Zeile/Feld. |
| 3+4 | Auth nicht als Backup-Daten behandeln | `auth.password_hash`, `auth.jwt_secret`, `auth.token_version` werden nie exportiert und beim Restore aus den Settings gefiltert, statt die laufende Anmeldung stillschweigend zurückzusetzen. Getestet: eine Restore-Datei mit gefälschtem `auth.jwt_secret` wird angenommen (Restore selbst gelingt), die aktuelle Sitzung bleibt aber unverändert gültig. |
| 5 | Restore-Größe realistisch begrenzen | `backupRouter` bekommt einen eigenen `express.json({ limit: "40mb" })`, **vor** dem globalen 1-MB-Parser gemountet (sonst hätte der globale Parser den Body schon verworfen, bevor die Route überhaupt läuft). Getestet: ~2 MB-Restore gelingt, 1 MB bleibt globales Limit für alle anderen Routen. |
| 6 | Ersteinrichtung atomar | `configStore.js#setSettingIfAbsent`: ein einzelnes synchrones `INSERT … WHERE NOT EXISTS`. Getestet mit zwei tatsächlich parallelen `POST /auth/setup`-Requests (`Promise.all`): garantiert genau ein 201, ein 403. |
| 7 | Sitzungen widerrufbar | Neues `auth.token_version` in jedem JWT (`v`-Claim); `requireAuth` vergleicht gegen den aktuellen Wert. Passwortwechsel erhöht die Version → alle alten Tokens (andere Geräte/Browser) werden sofort ungültig; die aktuelle Sitzung bekommt in derselben Antwort ein frisches Token (Frontend übernimmt es automatisch, kein Zwangs-Logout der eigenen Sitzung). Getestet inkl. Playwright-Lauf durch die echte UI. |
| 8 | Passwort-Härtung | Passwörter >72 UTF-8-Bytes (bcrypt-Grenze) werden abgelehnt statt still gekürzt. `PATCH /auth/password` hat jetzt eine eigene Rate-Limitierung (vorher unbegrenzt). |
| 9 | Offline-Cache eingrenzen | `vite.config.js`: Allow-Liste statt „alles außer X" – nur Aufgaben/Kalender/Rechnungen/Bereiche/Verträge/Ziele/Notizen/Prompts/LinkedIn werden offline gecacht. Auth, Settings, Backup, Mail, Gesundheit **nicht**. Cache wird zusätzlich bei Logout, Passwortwechsel, Restore und jedem 401 geleert (`api/client.js#clearOfflineCache`). |
| 13 | Kalendertrennung (Abschnitt 2) | **Bestätigter, konkreter Bug:** `DELETE /api/settings/calendar` wurde vom generischen `DELETE /:key`-Handler abgefangen (der vorher registriert war), meldete Erfolg, löschte aber `calendar.icloud` nie wirklich und rief `resetCalendarCache()` nie auf. Fix: alle spezifischen Routen stehen jetzt vor den generischen `/:key`-Handlern. Getestet: Kalender konfigurieren → trennen → `GET /settings/calendar` zeigt danach wirklich `configured: false`. |

Zusätzlich: `backend/src/index.js` exportiert jetzt die `app`-Instanz und
lauscht nur noch, wenn die Datei direkt gestartet wird – notwendig, damit
Tests gegen eine echte, aber isolierte Server-Instanz laufen können, ohne
den Produktivport zu belegen.

## Bewusst nicht umgesetzt (mit Begründung)

**Restliche Punkte aus Abschnitt 1–6 (10–12, 14–52):** nicht angefasst.
Auswahl der wichtigsten Lücken für eine Folgerunde:
- **10 (Keychain), 11 (LAN-Freigabe-Härtung):** setzen Entscheidungen voraus
  (welcher Migrationspfad, welches Bedrohungsmodell für LAN-Zugriff), keine
  reinen Bugfixes.
- **12 (Dependency-Audit):** `npm audit` zeigt aktuell 5 moderate/hohe
  Findings in beiden `package-lock.json` – nicht einzeln analysiert/gefixt,
  siehe „Bekannte offene Punkte" unten.
- **14–27 (Bereichsreferenzen-Migration, Datei-/DB-Fehlerkompensation,
  IMAP-UID-Stabilität, Scanner-Limits/Idempotenz, Timeouts, Kalender-RRULE/
  DST/Ganztag, einheitliche Validierung, Geld als Cent-Modell, CSV-Grammatik,
  Pagination):** inhaltlich groß, brauchen eigene Test-Fixtures (echte
  IMAP-/CalDAV-Antworten, DST-Übergänge, große Datenmengen) – nicht in
  dieser Runde.
- **28–39 (Frontend-Ehrlichkeit):** Ein Teil (Seiten-Header auf allen
  Modulen, konsistente leere Zustände, Kennzahlenzeile auf der Übersicht)
  wurde bereits in einer früheren Design-Konsolidierung dieses Projekts
  umgesetzt (siehe Commit-Historie „Backend geprüft, Onboarding-Bug
  behoben, Oberfläche konsolidiert"), aber **nicht** gegen die spezifischen
  Behauptungen dieses Prompts (z. B. Zeitzone `Europe/Berlin`, Suche mit
  Request-Generation gegen veraltete Antworten, Kalenderraster-Wochenkante)
  einzeln nachgeprüft.
- **40–46 (visuell/Barrierefreiheit):** keine automatisierte
  Kontrastmessung, kein VoiceOver-Test durchgeführt (kein Mac in dieser
  Cloud-Umgebung verfügbar, siehe unten).
- **47–52 (native macOS-Hülle):** `macos/Sources/PersonalDashboardApp.swift`
  wurde gelesen, aber nicht verändert. **In dieser Cloud-Linux-Umgebung
  existiert kein Xcode/macOS-Toolchain** – die Swift-App kann hier weder
  gebaut noch ausgeführt noch mit VoiceOver getestet werden. Jede Aussage
  über „funktioniert nativ" wäre unbelegt und wird deshalb nicht gemacht.

**Abschnitte 7–11 (42 neue Design-/Produkt-/Backend-Punkte, „Nachtblau"):**
**nicht umgesetzt.** Das ist kein Versehen, sondern folgt der eigenen
Prioritätenregel des Prompts: „Reihenfolge: Sicherheits-/Restoregrenzen →
… → native Auslieferung" und §10s Paket-Einteilung, die Pakete B–F explizit
hinter eine abgeschlossene Paket A stellt. Außerdem baut §7 seine
Farbwerte auf einer falschen Prämisse auf: Der Prompt behauptet, die
„vorhandenen" Farben seien Nachtblau (`#071421` etc.) – das aktuelle
`frontend/src/index.css` in diesem Repo ist tatsächlich Waldgrün/Lime
(Evermont-Identität). Eine so grundlegende Diskrepanz zwischen Prompt-
Annahme und echtem Code ist ein Signal, vor einer kompletten
Neugestaltung Rücksprache zu halten statt 42 weitere Punkte auf einer
möglicherweise falschen Grundlage umzusetzen.

## Bekannte offene Punkte aus dieser Runde selbst

- `npm audit` meldet für `backend/` weiterhin 5 moderate/hohe Findings
  (nicht durch diese Änderungen verursacht, vorbestehend) – nicht
  analysiert, welche davon tatsächlich erreichbare Laufzeitpfade betreffen
  vs. Dev-/Build-Only-Abhängigkeiten (Punkt 12 im Prompt).
- `backend/src/scripts/hashPassword.js` (Kommandozeilen-Hilfsskript für den
  `.env`-Fallback) hat noch nicht dieselbe 72-Byte-Prüfung wie die
  HTTP-Routen – niedrige Priorität, da nur ein optionaler Alt-Installations-
  Pfad, aber der Vollständigkeit halber hier vermerkt.
- Bestehende Sitzungen (Tokens, die vor diesem Deploy ausgestellt wurden)
  werden durch die neue `token_version`-Prüfung beim ersten Request nach
  dem Update ungültig (kein `v`-Claim ≠ aktuelle Version) – einmaliges
  erneutes Anmelden auf allen Geräten ist nach diesem Update zu erwarten,
  das ist beabsichtigt und sicherheitsrelevant korrekt, aber erwähnenswert.

## Nächste sinnvolle Schritte (Vorschlag, keine Festlegung)

1. Abschnitt 2 zu Ende bringen (14–27), beginnend mit Bereichsreferenzen-
   Migration und Geld-als-Cent-Modell – beides mit klarem Testpfad ohne
   externe Fixtures.
2. `npm audit` beider `package-lock.json` einzeln durchgehen und
   dokumentieren, was erreichbar ist.
3. Erst danach Abschnitt 3/4 (Frontend-Ehrlichkeit, Barrierefreiheit) gegen
   die konkreten Behauptungen in diesem Prompt nachprüfen.
4. Abschnitte 5 und 47–52 (native Hülle) nur auf einem echten Mac mit
   Xcode möglich – dort auch die in Abschnitt 6 geforderten nativen
   Smoke-Tests (VoiceOver, Sleep/Wake, Portkollision) durchführen.
5. Abschnitte 7–11 erst nach Klärung, ob die Nachtblau-Neuausrichtung
   tatsächlich gewollt ist (siehe Diskrepanz oben), und dann in den in §10
   vorgeschlagenen Paketen B–F, nicht als Ganzes.
