# Sicherheits- und Zuverlässigkeitshärtung – Statusbericht

Dieser Bericht dokumentiert, was aus dem 94-Punkte-Verbesserungsprompt vom
7. September 2026 tatsächlich umgesetzt, getestet und verifiziert wurde –
und was bewusst zurückgestellt wurde. Ehrlich gesagt: **94 Punkte sind kein
Ein-Sitzungs-Umfang.** Umgesetzt wurden bisher drei Runden: eine
vollständige, getestete Tranche aus Abschnitt 1 (Sicherheit/Restore), danach
der komplette Abschnitt 2 (Datenkonsistenz/Backend), und zuletzt der
Kernbestand von Abschnitt 3 (Frontend-Ehrlichkeit: Zeitzone, Kalenderraster,
Barrierefreiheit, Suchpalette, Formularverknüpfung, Schreibaktions-Status),
jeweils mit automatisierten Tests. Alles andere steht unten explizit als offen.

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

## Abschnitt 3 – Frontend-Ehrlichkeit (Punkte 28, 29, 35, 37–39 umgesetzt)

Rein frontendseitig, keine Backend-Änderung nötig. Getestet durch
`frontend/test/date.test.js` (4 neue Tests für den Datums-Helfer,
`cd frontend && npm test`) sowie einen Playwright-Lauf durch die echte
gebaute UI (Login, Aufgaben-Formular, Kalender-Monatsansicht, Sidebar,
Suchpalette) – Details unten je Punkt. Vor der Umsetzung wurde jeder Punkt
gegen den echten Code geprüft statt die Prompt-Behauptung ungeprüft zu
übernehmen; Ergebnis dieser Prüfung bei 30–36 unten.

| # | Punkt | Was geändert wurde |
|---|---|---|
| 29+37 | Zeitzone (UTC- statt Lokalzeit-Bug) | `new Date().toISOString().slice(0, 10)` liefert **UTC**, nicht die Lokalzeit des Browsers. In Deutschland (UTC+1/+2) bedeutet das: kurz nach Mitternacht Lokalzeit (bis zu 2 Stunden, je nach Sommer-/Winterzeit) hält der Code noch den Vortag für „heute" – „heute fällig"/„überfällig" war in diesem Fenster falsch. Betroffen: `Kalender.jsx#isoDate` (Tagesgruppierung im Kalenderraster), `Uebersicht.jsx` (Kennzahlenzeile, „Heutige Termine"), `Rechnungen.jsx` (Überfällig-Berechnung), `Gesundheit.jsx` (Vorbelegung des Datumsfelds). Neue `frontend/src/utils/date.js#localIsoDate()` nutzt lokale Getter (`getFullYear`/`getMonth`/`getDate`) statt `toISOString()`, an allen vier Stellen eingesetzt. 4 automatisierte Tests, u. a. für die Jahresgrenze. |
| 37 (Rest) | Ganztägige Termine im Monatsraster | Ganztägige Termine wurden komplett separat gesammelt und nur als flache „Ganztägig"-Leiste oberhalb des Rasters angezeigt – in der Monatsansicht tauchten sie **an keinem einzigen Tag** in der Zelle auf, obwohl Tages-/Zeitraster dafür vorgesehen sind. Jetzt: neue `allDayByDay`-Zuordnung (ein Eintrag pro überspanntem Kalendertag, DTEND als exklusiv behandelt wie im iCal-Standard) wird in `MonthGrid` zusätzlich zu den Zeit-Terminen der jeweiligen Zelle gerendert; die „Ganztägig"-Leiste bleibt auf Tag/Woche beschränkt (sonst doppelte Anzeige in der Monatsansicht). |
| 28 | Tastatur-/Screenreader-Falle im eingeklappten „Mehr"-Menü | Die Unterpunkte unter „Mehr" waren per CSS (`grid-template-rows: 0fr`) nur optisch ausgeblendet, blieben aber per Tab erreichbar und für Screenreader sichtbar – ein Tastaturnutzer konnte in unsichtbare Links springen. `inert` (bedingt gespreadet, nicht `inert={false}`, da ältere React-Versionen das als String-Attribut `inert="false"` rendern würden, was der Browser trotzdem als „inert" liest) entfernt den Container jetzt gleichzeitig aus Tab-Reihenfolge und Accessibility-Baum, exakt synchron zum visuellen Zustand. Playwright-Check: `inert`-Attribut ist bei eingeklapptem Menü gesetzt, nach dem Öffnen entfernt. |
| 35 | Suchpalette: veraltete Treffer überschreiben neue | Die Suche hatte ein 200ms-Debounce, aber keinen Schutz gegen eine bereits laufende, langsamere Anfrage einer älteren Eingabe – die konnte nach einer neueren, schnelleren Antwort zurückkommen und deren aktuellere Treffer überschreiben. Jetzt `AbortController`: eine neue Eingabe bricht die noch laufende alte Anfrage ab, bevor sie das Ergebnis überschreiben kann. |
| 38 | Label/Feld nicht programmatisch verknüpft | `<Label>`-Text und `<Input>`/`<Select>`/`<Textarea>` standen bisher als reine Geschwister-Elemente nebeneinander, ohne `htmlFor`/`id`-Paar (nur 2 von 11 Seiten hatten das überhaupt, der Rest verließ sich auf optische Nähe) – ein Klick auf das Label-Wort fokussierte das Feld nicht, Screenreader lasen Label und Feld nicht zuverlässig zusammen. Neue `FormField`-Komponente (`components/ui/Field.jsx`) generiert über `useId()` automatisch ein stabiles `id`/`htmlFor`-Paar und übernimmt es per `cloneElement` auf das Kindelement – ohne dass jede Seite selbst eine `id` verwalten muss. 62 von 68 `<Label>`+Feld-Stellen über 10 Seiten umgestellt (Details unten). Playwright-Check: Klick auf „Titel"-Label im Aufgaben-Formular fokussiert nachweislich das verknüpfte Eingabefeld. |
| 39 | Schreibaktionen ohne Rückmeldung/Doppelklick-Schutz | Aktionen wie „erledigt"/„bezahlt" umschalten oder Löschen liefen als „fire and forget": ein Fehlschlag (abgelaufene Session, Netzwerkfehler, Serverablehnung) verschwand als unbehandelte Promise-Ablehnung, ohne dass die Nutzerin etwas davon sah, und ein Doppelklick konnte dieselbe Aktion zweimal auslösen, bevor die erste Antwort da war. Neuer `useAsyncAction`-Hook (`hooks/useAsyncAction.js`) kapselt eine Aktion mit Pending-Status pro Datensatz und Fehleranzeige; angewendet auf Anlegen/Speichern-Formulare sowie Umschalten/Löschen/Bestätigen-Aktionen in Aufgaben, Rechnungen, Gesundheit, Notizen, Verträge, Ziele, LinkedIn, Dokumente, Prompt-Bibliothek. Buttons zeigen während der Anfrage „Speichert…"/„Löscht…" und sind deaktiviert; betroffene Zeilen werden abgeblendet. Playwright-Check: dreifacher schneller Klick auf „Anlegen" erzeugt nachweislich genau **einen** Datensatz, nicht drei. In `Ziele.jsx` bewusst **nicht** angefasst: `updateMilestones` hatte bereits ein eigenes, funktionierendes Optimistic-Update-mit-Rollback-Muster (lokaler State wird sofort aktualisiert, bei Fehler per `load()` zurückgesetzt) – das in den generischen Hook zu zwingen hätte das Verhalten bei mehreren schnell hintereinander angehakten Meilensteinen ohne klaren Vorteil verändert. |

**Bereits vorher in Ordnung, bei der Prüfung bestätigt statt blind
verändert:**
- **30** (Zahlen "–" statt 0 bei Fehler): `Uebersicht.jsx`s „Ungelesene
  Mails"-Kachel und `Mail.jsx` selbst zeigen bei Fehlern bereits korrekt
  einen expliziten Fehlerzustand statt einer irreführenden „0" – aus der
  vorherigen Design-Konsolidierung dieses Projekts, hier nur verifiziert.
- **34** (kontextbezogene Aktionen, keine vorgetäuschten Möglichkeiten):
  Der Kalender ist bereits explizit als „nur Ansicht, kein
  Anlegen/Bearbeiten" beschriftet – keine irreführenden Buttons für
  Aktionen, die nicht möglich sind.

**Bei der Prüfung als nicht zutreffend bestätigt (nicht „übersehen",
sondern geprüft und die Prompt-Prämisse trifft nicht zu):**
- **31** (angeblich fabriziertes KI-Metadaten-„Briefing"): Das
  „Tagesbriefing" auf der Übersicht ist ein einfaches, ehrliches
  Freitextfeld, das die Nutzerin selbst befüllt („Noch kein Tagesbriefing
  eingerichtet – klicke auf „Bearbeiten"") – keine vorgetäuschte KI-Analyse
  zum Nachbessern gefunden.
- **32** (Wetter-Widget): Es gibt in diesem Repository **kein**
  Wetter-Widget – weder mit noch ohne Bug. Punkt ist gegenstandslos für
  dieses Projekt.
- **36** (einheitliche Toast-/Dialog-Schicht): Es existiert aktuell keine
  gemeinsame Toast-/Dialog-Komponente im Projekt (grep über die gesamte
  `components/`-Struktur bestätigt das) – vereinzelte `fixed inset-0
  z-50`-Muster direkt in den Stellen, die sie brauchen (z. B.
  `CommandPalette.jsx`). Eine komplette neue Overlay-Schicht einzuführen
  wäre eine Architekturentscheidung ohne akuten Bug dahinter und wurde
  daher zurückgestellt, nicht implementiert.

**Bekannte Einschränkung dieser Runde:** Von den 68 `<Label>`+Feld-Stellen
wurden 62 automatisch auf `FormField` umgestellt, 6 bewusst übersprungen,
weil das Umwandeln unsicher gewesen wäre (u. a. `Login.jsx`s Passwortfelder
hatten bereits eine korrekte manuelle `id`/`htmlFor`-Paarung und wurden
nicht angetastet; `Einstellungen.jsx`s Farbschema-Auswahl und
Kalendername-je-Bereich-Liste haben keinen einzelnen 1:1-Feld-Bezug;
`Dokumente.jsx`s Datei-Upload nutzt ein natives `<input type="file">`
statt der `Input`-Komponente). Diese Restfälle sind nicht barrierefrei
schlechter als vorher (kein Regressions, nur keine Verbesserung an diesen
konkreten Stellen).

**Zu Punkt 39 selbst noch offen:** Die im Prompt genannten Unterpunkte
„Optimistic-Rollback" (außer dem bereits vorhandenen Fall in `Ziele.jsx`)
und „Warnung bei ungespeicherten Formularen beim Verlassen der Seite"
wurden **nicht** umgesetzt – das wäre ein deutlich größerer Eingriff
(Formular-Dirty-Tracking, `beforeunload`/Router-Blocker) ohne im Rahmen
dieser Prüfung gefundenen konkreten Fehlerfall, der das akut nötig macht.
Pending-Status, Fehleranzeige und Doppelklick-Schutz (der eigentliche Bug:
stille Fehlschläge und doppelte Submits) sind umgesetzt und getestet.

## Bewusst nicht umgesetzt (mit Begründung)

**Restliche Punkte aus Abschnitt 1–6 (10–12, 22 vollständig, 27, 33, 40–52):**
nicht angefasst (30–32, 34, 36 wurden geprüft, siehe Abschnitt 3 oben – dort
zählt „geprüft und bestätigt" nicht als „nicht angefasst", auch wenn kein
Code geändert wurde). Auswahl der wichtigsten Lücken für eine Folgerunde:
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
- **28, 29, 35, 37, 38, 39 (Frontend-Ehrlichkeit):** inzwischen umgesetzt,
  siehe eigener Abschnitt „Abschnitt 3" oben. **30, 34** bei der Prüfung als
  bereits korrekt bestätigt. **31, 32, 36** bei der Prüfung als für dieses
  Projekt nicht zutreffend bestätigt (siehe Begründung oben je Punkt) –
  **33** (verbleibender Punkt aus Abschnitt 3/4, nicht einzeln geprüft)
  bleibt offen.
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

- Beim Playwright-Testlauf für Abschnitt 3 traten wiederholt
  `ERR_CONNECTION_RESET`/503-Fehler beim Laden von `fonts.googleapis.com`
  auf (Manrope-Schriftart-Preconnect in `index.html`) – das liegt an der
  Netzwerkrichtlinie dieser Cloud-Testumgebung (nicht alle externen Hosts
  erreichbar), nicht an einer Code-Änderung dieser Runde. Auf einem echten
  Mac mit normalem Internetzugang tritt das nicht auf; die App funktioniert
  mit Font-Fallback auch ohne die Google-Font.
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
2. Abschnitt 4 (visuell/Kontrast/Bewegungsreduktion, Punkte 40–46) gegen
   die konkreten Behauptungen in diesem Prompt nachprüfen – Abschnitt 3
   (Frontend-Ehrlichkeit) ist jetzt erledigt.
3. Falls später wirklich benötigt: volle Cent-Spalten-Migration für Geld
   (Punkt 23) und vollständig vereinheitlichte Zod-Validierung über alle
   Routen (Punkt 22) – beides mit eigenem, vom Nutzer bestätigtem Anlauf.
4. Abschnitte 5 und 47–52 (native Hülle) nur auf einem echten Mac mit
   Xcode möglich – dort auch die in Abschnitt 6 geforderten nativen
   Smoke-Tests (VoiceOver, Sleep/Wake, Portkollision) durchführen.
5. Abschnitte 7–11 erst nach Klärung, ob die Nachtblau-Neuausrichtung
   tatsächlich gewollt ist (siehe Diskrepanz oben), und dann in den in §10
   vorgeschlagenen Paketen B–F, nicht als Ganzes.
