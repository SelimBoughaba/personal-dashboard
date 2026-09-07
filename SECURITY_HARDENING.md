# Sicherheits- und Zuverlässigkeitshärtung – Statusbericht

Dieser Bericht dokumentiert, was aus dem 94-Punkte-Verbesserungsprompt vom
7. September 2026 tatsächlich umgesetzt, getestet und verifiziert wurde –
und was bewusst zurückgestellt wurde. Ehrlich gesagt: **94 Punkte sind kein
Ein-Sitzungs-Umfang.** Umgesetzt wurden bisher zwei Runden: eine
vollständige, getestete Tranche aus Abschnitt 1 (Sicherheit/Restore) und
danach der komplette Abschnitt 2 (Datenkonsistenz/Backend), jeweils mit
automatisierten Tests. Alles andere steht unten explizit als offen.

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

## Abschnitt 2 – Datenkonsistenz und Backend (vollständig umgesetzt)

Getestet durch `backend/test/data-integrity.test.js` (17 zusätzliche Tests,
zusammen mit Runde 1 jetzt **29 Tests, alle grün**, `cd backend && npm
test`) sowie einen Playwright-Lauf durch die echte UI (Speicherort ändern,
Rechnung anlegen, Lebensbereiche verwalten).

| # | Punkt | Was geändert wurde |
|---|---|---|
| 14 | Bereichsreferenzen vollständig migrieren | Löschen/Reassignment lief bisher nur über `tasks`/`invoices` – Dokumente, Verträge, Ziele, Notizen, Prompts, LinkedIn-Beiträge wurden beim Löschen eines Bereichs still verwaist. Jetzt zentrale `AREA_OWNED_TABLES`-Liste (`constants.js`), von Löschen/Reassign, Backup-Validierung und einer neuen Reparatur-Migration (`0013_repair_orphaned_area_refs`) gemeinsam genutzt. `getDefaultAreaId()` bevorzugt jetzt einen **aktiven** Default; Archivieren des aktuellen Default-Bereichs verschiebt den Default automatisch und ist blockiert, falls es der letzte aktive Bereich wäre (bisher gar nicht geprüft). `POST /areas/reorder` nummeriert jetzt auch nicht in der Liste enthaltene Bereiche lückenlos durch. |
| 15 | Datei-/DB-Operationen ausfallsicher | Dokument-Upload: DB-Insert steckt jetzt in try/catch, ein Fehlschlag löscht die bereits von multer geschriebene Datei wieder (vorher: verwaiste Datei ohne DB-Eintrag). Speicherordner-Wechsel ist jetzt eine echte, überprüfte Migration (`POST /settings/documents-folder`): vorhandene Dateien werden verschoben, bei Fehlern mitten im Verschieben wird zurückgerollt und die Einstellung bleibt unverändert, statt Dateien zwischen altem und neuem Ordner aufgeteilt liegen zu lassen. |
| 16 | IMAP-Identitäten stabilisieren | `invoiceScanner.js` rief `search`/`fetchOne`/`download` ohne `{uid:true}` auf – imapflow interpretierte die Werte dadurch als Sequenznummern, die aber als `mail_ref` in der DB **persistiert** wurden (Sequenznummern sind nur innerhalb einer Verbindung stabil, nicht über mehrere Scans hinweg). Jetzt explizit UID-Modus überall, plus Mailbox-UIDVALIDITY als Teil von `mail_ref`. `imap.js` (Live-Mailansicht) ebenso korrigiert, dort ohne Live-Bug, aber für Robustheit. |
| 17 | Scanner begrenzen | `client.download()` hatte kein Byte-Limit – ein beliebig großer "PDF"-Anhang wäre komplett in den Hauptprozess gepuffert worden. Jetzt `maxBytes` **und** ein Vorab-Check von `meta.expectedSize`, bevor der Stream überhaupt konsumiert wird. |
| 18 | Scans idempotent | SELECT-dann-INSERT war eine TOCTOU-Race; ein zweiter, sich überschneidender Scan hätte bei einer UNIQUE-Verletzung eine ungefangene Exception geworfen und **alle** restlichen Nachrichten dieses Kontos übersprungen. Jetzt `INSERT OR IGNORE`, `info.changes` entscheidet, ob wirklich neu. |
| 19 | Timeouts wirklich beenden | Der eigentliche Kalender-Tab (`caldav.js#getEvents`, nicht nur der „Verbindung testen"-Button) hatte **gar kein** Zeitbudget für Verbindungsaufbau, Kalenderliste oder Terminabruf. Jetzt überall `withTimeout`. `getMailboxLock` in `imap.js`/`invoiceScanner.js` bekommt `acquireTimeout`, vorher unbegrenzt. |
| 20 | Integrationszustände / Teilfehler | **Bestätigter, konkreter Bug:** `caldav.js#getEvents` nutzte `Promise.all` über alle Kalender – ein einzelner defekter/langsamer Kalender ließ die Termine **aller** anderen, erfolgreich geladenen Kalender mit verschwinden. Jetzt `Promise.allSettled` wie bereits beim Mehrkonten-Mailabruf. Teilfehler werden serverseitig geloggt; ein für den Client sichtbarer Teilfehler-Hinweis wäre eine Erweiterung des Response-Formats und ist bewusst nicht Teil dieser Runde (siehe unten). |
| 21 | Kalendersemantik | RRULE/EXDATE/RECURRENCE-ID/Ganztag waren bereits solide implementiert – eine echte Lücke gefunden und geschlossen: keine Obergrenze für Vorkommen pro Serie (`MAX_OCCURRENCES_PER_EVENT`, jetzt 500), ein pathologisches RRULE (z. B. sekündlich über Jahre) konnte sonst Zeit/Speicher unbegrenzt beanspruchen. Zusätzlich validiert `routes/calendar.js` jetzt Zeitraum-Plausibilität (gültige Daten, „Bis" nach „Von", max. 400 Tage) an der Routen-Grenze. |
| 22 | Validierung vereinheitlichen | **Nicht** flächendeckend umgesetzt (siehe unten) – die bestehenden handgeschriebenen Validatoren pro Route sind korrekt, nur nicht DRY. Was in dieser Runde vereinheitlicht wurde: die neuen Backup-Zod-Schemas dienen jetzt auch als Referenz für Enums (`constants.js`). |
| 23 | Geld präzise | `!Number.isNaN(Number(x))` ließ `"Infinity"`/`"-Infinity"` durch (kein NaN, aber kein sinnvoller Betrag) – in `invoices.js` (amount) und `contracts.js` (cost, cancellation_period_days) auf `Number.isFinite` bzw. `Number.isInteger` + Vorzeichenprüfung umgestellt. Volle Cent-Spalten-Migration bewusst zurückgestellt (siehe unten). |
| 24 | Rechnungserkennung als Vorschlag | Neue Spalten `source`/`confirmed` (Migration `0014`). Scanner-erzeugte Rechnungen starten unbestätigt, manuell angelegte/importierte gelten als bestätigt. Frontend zeigt einen „Vorschlag"-Badge und einen „Bestätigen"-Button; Bearbeiten+Speichern eines Vorschlags bestätigt ihn ebenfalls (eine Korrektur ist eine Form von Prüfung). Bereits vorhandene Scan-Rechnungen (erkennbar an `mail_ref`) wurden rückwirkend als unbestätigt markiert. |
| 25 | CSV robust/sicher | `parseCsv` wirft jetzt einen Fehler bei einem nicht geschlossenen Anführungszeichen, statt den kompletten Rest der Datei stillschweigend in ein Feld zu schlucken. `csvEscape` neutralisiert Werte, die mit `=`/`+`/`-`/`@` beginnen (klassische Formel-Injection in Excel/Sheets) – relevant, weil Rechnungsdaten aus Scan-Ergebnissen (E-Mail-Betreff/PDF-Text, nicht vertrauenswürdig) in die exportierte CSV wandern können. |
| 26 | Betrieb stabilisieren | `index.js` hatte **keinerlei** Shutdown-Behandlung. Jetzt schließen SIGTERM/SIGINT-Handler zuerst neue Verbindungen (`server.close`), dann die SQLite-Verbindung sauber (`db.close`), mit 5s-Notausstieg falls eine hängende Anfrage das blockiert. |

**Nebenbei gefunden und mitkorrigiert:** Beim Schreiben der Tests für Punkt
21 fiel auf, dass die in Runde 1 gebaute Bereichsreferenz-Prüfung beim
Restore (`findDanglingAreaRef`) auch über `health_entries` gelaufen wäre –
diese Tabelle hat aber bewusst **kein** `area`-Feld (Gesundheitsdaten sind
bereichsübergreifend, siehe README). Jeder Restore mit Gesundheitseinträgen
wäre dadurch fälschlich abgelehnt worden. Ausschluss ergänzt, Regressionstest
dafür hinzugefügt.

## Bewusst nicht umgesetzt (mit Begründung)

**Restliche Punkte aus Abschnitt 1–6 (10–12, 22 vollständig, 27, 28–52):**
nicht angefasst. Auswahl der wichtigsten Lücken für eine Folgerunde:
- **10 (Keychain), 11 (LAN-Freigabe-Härtung):** setzen Entscheidungen voraus
  (welcher Migrationspfad, welches Bedrohungsmodell für LAN-Zugriff), keine
  reinen Bugfixes.
- **12 (Dependency-Audit):** `npm audit` zeigt aktuell Findings in beiden
  `package-lock.json` – nicht einzeln analysiert/gefixt, siehe „Bekannte
  offene Punkte" unten.
- **22 (vollständig einheitliche Validierung):** nur teilweise – eine
  komplette Umstellung aller ~13 Routen-Dateien auf gemeinsame Zod-Schemas
  wäre mechanisch möglich, aber ein großer, risikoarmer aber
  aufwändiger Umbau ohne akuten Bug dahinter; zurückgestellt zugunsten der
  Punkte mit tatsächlich gefundenen Fehlern.
- **23 (volle Cent-Spalten-Migration):** bewusst NICHT umgesetzt. Eine
  Umstellung von `amount REAL`/`cost REAL` auf Integer-Cent-Spalten ist ein
  Schema-Wechsel an echten Finanzdaten – genau die Art von „destruktiver
  Migration ohne vorher überprüfbare Sicherung" Migration, vor der die
  Arbeitsregeln dieses Prompts selbst warnen. Die risikoarme Teilkorrektur
  (Infinity/NaN ablehnen) wurde umgesetzt, die strukturelle Migration
  braucht einen eigenen, vom Nutzer bestätigten Anlauf mit Backup/Rollback-
  Plan.
- **27 (Pagination/Suche zu Datensätzen):** kein akuter Bug bei der
  aktuellen (persönlichen, nicht massenhaften) Datenmenge; der Prompt
  selbst verlangt „ohne nachgewiesenen Bedarf" nichts hinzuzufügen.
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
- Vor dieser Runde gescannte Rechnungen wurden anhand von `mail_ref IS NOT
  NULL` rückwirkend als `mail_scan`/unbestätigt markiert (Migration 0014) -
  korrekt für Herkunft, aber ob sie der Nutzer damals schon geprüft hat,
  ist nicht mehr rekonstruierbar. Wer viele alte Scan-Rechnungen hat, sieht
  nach dem Update entsprechend viele „Vorschlag"-Badges auf einmal.
- Der neue `mail_ref`-Aufbau (mit UIDVALIDITY) ist inkompatibel mit dem
  alten Format – bereits importierte Rechnungen bleiben unverändert
  erhalten, aber ein erneuter Scan derselben Postfach-Nachrichten könnte
  sie (mit dem neuen, korrekteren Schlüssel) ein zweites Mal anlegen. Das
  ist der bewusst in Kauf genommene Kompromiss aus Punkt 16 („bestehende
  mail_ref-Werte mit kompatiblem Übergang behandeln") - eine rückwirkende
  Umschlüsselung der alten Einträge ist ohne die ursprüngliche
  IMAP-Verbindung nicht mehr möglich.
- `npm audit` meldet für `backend/` weiterhin Findings (nicht durch diese
  Änderungen verursacht, vorbestehend) – nicht analysiert, welche davon
  tatsächlich erreichbare Laufzeitpfade betreffen (Punkt 12 im Prompt).
- `backend/src/scripts/hashPassword.js` (Kommandozeilen-Hilfsskript für den
  `.env`-Fallback) hat noch nicht dieselbe 72-Byte-Prüfung wie die
  HTTP-Routen – niedrige Priorität, da nur ein optionaler Alt-Installations-
  Pfad, aber der Vollständigkeit halber hier vermerkt.

## Nächste sinnvolle Schritte (Vorschlag, keine Festlegung)

1. `npm audit` beider `package-lock.json` einzeln durchgehen und
   dokumentieren, was erreichbar ist (Punkt 12).
2. Abschnitt 3/4 (Frontend-Ehrlichkeit, Barrierefreiheit) gegen die
   konkreten Behauptungen in diesem Prompt nachprüfen (z. B. Zeitzone
   `Europe/Berlin`, Suche mit Request-Generation, Kalenderraster-Wochenkante).
3. Falls später wirklich benötigt: volle Cent-Spalten-Migration für Geld
   (Punkt 23) und vollständig vereinheitlichte Zod-Validierung über alle
   Routen (Punkt 22) – beides mit eigenem, vom Nutzer bestätigtem Anlauf.
4. Abschnitte 5 und 47–52 (native Hülle) nur auf einem echten Mac mit
   Xcode möglich – dort auch die in Abschnitt 6 geforderten nativen
   Smoke-Tests (VoiceOver, Sleep/Wake, Portkollision) durchführen.
5. Abschnitte 7–11 erst nach Klärung, ob die Nachtblau-Neuausrichtung
   tatsächlich gewollt ist (siehe Diskrepanz oben), und dann in den in §10
   vorgeschlagenen Paketen B–F, nicht als Ganzes.
