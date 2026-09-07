# Sicherheits- und Zuverlässigkeitshärtung – Statusbericht

Dieser Bericht dokumentiert, was aus dem 94-Punkte-Verbesserungsprompt vom
7. September 2026 tatsächlich umgesetzt, getestet und verifiziert wurde –
und was bewusst zurückgestellt wurde. Ehrlich gesagt: **94 Punkte sind kein
Ein-Sitzungs-Umfang.** Umgesetzt wurden bisher fünf Runden: eine
vollständige, getestete Tranche aus Abschnitt 1 (Sicherheit/Restore), danach
der komplette Abschnitt 2 (Datenkonsistenz/Backend), der Kernbestand von
Abschnitt 3 (Frontend-Ehrlichkeit: Zeitzone, Kalenderraster,
Barrierefreiheit, Suchpalette, Formularverknüpfung, Schreibaktions-Status),
der messbare Kernbestand von Abschnitt 4 (Optik/Barrierefreiheit/Motion:
Kontrastmessung und -korrektur, Skip-Link, Fokus-Trap in der Suchpalette,
Zoom-/Mobil-Verifikation) und zuletzt Abschnitt 5 (native macOS-Hülle) –
letzterer mit einer **wichtigen Einschränkung**, die sofort am Anfang
stehen sollte statt versteckt zu werden: diese Cloud-Sitzung hat **keinen
Zugriff auf Xcode oder eine macOS-Toolchain**. Die Backend- und
Frontend-Teile von Abschnitt 5 sind wie gewohnt automatisiert getestet; die
Swift-Änderungen an der nativen Hülle selbst sind dagegen **ungeprüft
gegen einen Compiler** – sorgfältig anhand des Quelltexts und bekannter,
etablierter API-Signaturen vorgenommen, aber nicht kompiliert, nicht
ausgeführt, nicht auf einem echten Mac getestet. Details, was das konkret
bedeutet, unten im eigenen Abschnitt. Alles andere steht unten explizit als
offen.

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

## Abschnitt 4 – Optik, Layout, Barrierefreiheit und Motion (Punkte 43, 45 teilweise umgesetzt)

Vor der Umsetzung wurden die tatsächlichen, zusammengesetzten Farben
gemessen (WCAG-2.2-Kontrastformel gegen die echten Hintergrundfarben aus
`index.css`, nicht nur die rohen Token-Hexwerte) statt geschätzt – exakt
das, was Punkt 43 verlangt. Details der Messmethode: relative Luminanz
nach WCAG-Formel, Hintergrund als tatsächlich zusammengesetzte Farbe (z. B.
`bg-forest-900/70` über dem Seitenhintergrund gerechnet), getrennt für
Dunkel- und Hellmodus.

| # | Punkt | Was gemessen und geändert wurde |
|---|---|---|
| 43 | Fokusring im Hellmodus praktisch unsichtbar | **Bestätigter, konkreter Bug:** Der Fokusring (`:focus-visible`) nutzte immer `lime` (#c8ff52) – im Dunkelmodus 14.7:1 Kontrast (sehr gut), im Hellmodus gegen den hellen Seitenhintergrund aber nur **1.07:1** (WCAG-Minimum für Nicht-Text-Elemente wie Fokusringe: 3:1). Per Tastatur navigierende Personen hätten im Hellmodus praktisch keinen sichtbaren Fokusindikator gehabt – widerspricht Punkt 43 („Fokus darf nicht verdeckt sein") und Punkt 45 („sichtbarer Fokus") direkt. Neue themenabhängige CSS-Variable `--color-focus`: im Dunkelmodus unverändert `lime`, im Hellmodus der dunkle, markenkonsistente `forest-800`-Ton (Waldgrün) mit gemessenen 9.9:1. Playwright-Check: berechneter `outline-color` im Hellmodus ist exakt `rgb(23, 68, 56)`. |
| 43 | Formular-Labels im Dunkelmodus (Standardmodus!) unter AA | `text-muted` (Farbe der `<Label>`-Komponente, nach Abschnitt 3 jetzt an noch mehr Stellen im Einsatz) hatte im Dunkelmodus nur **3.29:1** Kontrast gegen den Kartenhintergrund – WCAG-2.2-AA verlangt 4.5:1 für normalen Text. Aufgehellter Wert (123 142 132 statt 96 112 104), gemessen 4.5–5:1 gegen Karten- und Seitenhintergrund. Playwright-Check: berechnete Label-Farbe entspricht exakt dem neuen Wert. |
| 43 | Status-/Fehlertext im Hellmodus kaum lesbar | Die Status-/Fehlerfarben (`status-hoch`/`mittel`/`niedrig`, u. a. für alle Formular-Fehlermeldungen `text-status-hoch` app-weit) waren themenunabhängig fest codiert – im Dunkelmodus 5.6–7.7:1 (gut), im Hellmodus gegen den hellen Hintergrund aber nur **2.0–2.8:1** (deutlich unter selbst dem 3:1-Minimum für UI-Komponenten, weit unter 4.5:1 für Text). Eine Fehlermeldung wie „Passwort falsch" wäre im Hellmodus kaum lesbar gewesen. Gleiche Farbfamilie, aber abgedunkelte, im Hellmodus gemessene Varianten (≥4.5:1) über dieselbe CSS-Variablen-Technik wie bei forest/ivory. |
| 43 | Durchgängig zu schwacher sekundärer Text | `text-ivory/NN`-Opazitätsstufen unter 50 % fielen in vielen Fällen unter AA – besonders im Hellmodus (z. B. `/45` nur 2.8:1, `/30` nur 1.9:1). Betraf u. a. Kennzahlen-Beschriftungen, Leerzustands-Texte, Suchpalette-Meldungen, Kalender-Wochentagsköpfe, Datei-Metadaten. 56 Stellen über 16 Dateien auf `/65` (misst 5–7:1 in beiden Themes) angehoben; bewusst **nicht** angefasst: abgeschaltete/„bald"-Menüpunkte und mit Durchstreichung bereits erledigte Aufgaben/bezahlte Rechnungen/abgehakte Meilensteine (etablierte, WCAG-konform ausgenommene De-Emphasis für inaktive bzw. erledigte Elemente). |
| 43 | Status nie ausschließlich über Farbe | Geprüft und bereits korrekt: Prioritäts-/Status-Badges tragen immer zusätzlich Text („Hoch"/„Bezahlt"/…), keine reine Farbcodierung gefunden. |
| 45 | Kein Skip-Link | Punkt 45 verlangt explizit einen Skip-Link – es gab keinen; Tastaturnutzer mussten durch die komplette Sidebar-Navigation tabben, bevor sie den eigentlichen Seiteninhalt erreichten. Neuer, nur bei Tastaturfokus sichtbarer „Zum Hauptinhalt springen"-Link vor der Sidebar; `<main id="main-content" tabIndex={-1}>` nimmt den Fokus auf. Playwright-Check: erster Tab-Druck zeigt den Link, Aktivierung verschiebt den Fokus nachweislich auf `#main-content`. |
| 45 | Suchpalette ohne echten Fokus-Trap, kein Fokus-Rückgabe | Die Suchpalette hat `role="dialog" aria-modal="true"`, aber Tab konnte trotzdem in die dahinterliegende Sidebar/Seite wandern (kein echter Trap trotz „aria-modal"), und beim Schließen ging der Fokus einfach verloren, statt zum auslösenden Button zurückzukehren. Sidebar und Hauptinhalt bekommen jetzt `inert`, solange die Palette offen ist (gleiches Muster wie das eingeklappte „Mehr"-Menü aus Abschnitt 3); `CommandPalette.jsx` merkt sich das vor dem Öffnen fokussierte Element und gibt den Fokus beim Schließen (Escape, Auswahl, Klick daneben) explizit zurück. Playwright-Check: Fokus vor Öffnen und nach Escape-Schließen ist nachweislich dasselbe Element. |
| 44 | Zoom/Responsivität stichprobenartig geprüft | Bereits korrekt, keine Änderung nötig: 200 %-Text-Zoom auf Desktop-Breite und ein 375px-Mobil-Viewport (inkl. mobiles Menü, Kalender-Monatsraster) erzeugen kein ungewolltes horizontales Scrollen; Playwright-Screenshots zeigen lesbares, nicht überlappendes Layout in beiden Fällen. |
| 46 | Bewegung/Motion geprüft | Bereits korrekt, keine Änderung nötig: `prefers-reduced-motion: reduce` UND ein manueller „Bewegung reduzieren"-Schalter (Einstellungen → Darstellung) reduzieren alle Animations-/Übergangsdauern auf ~0 – doppelt abgesichert. Alle gefundenen Übergänge liegen bei 200 ms (innerhalb der in Punkt 46 vorgeschlagenen Bandbreite 120–240 ms). Keine Dauerschleifen-Animationen (kein `animate-spin`/`animate-pulse` o. ä.) gefunden – Ladezustände sind Text („Lädt…"), keine Spinner. |

**Bewusst nicht umgesetzt (mit Begründung):**
- **40 (Nachtblau-Identität erhalten) und 41 (Editorial Serif für
  Überschriften):** Dieselbe, bereits in Abschnitt 7–11 dokumentierte
  Diskrepanz gilt hier direkt: Punkt 40 verlangt wörtlich „Ruhiges
  Nachtblau" – das tatsächliche `index.css` dieses Repos ist Waldgrün/Lime
  (Evermont-Identität), keine einzige Nachtblau-Farbe existiert im Code.
  Eine neue Serif-Schriftart für Überschriften einzuführen (Punkt 41) wäre
  eine echte Design-Entscheidung, die die bestehende, bewusst einheitliche
  Ein-Schriftart-Identität (nur Manrope, siehe `Einstellungen.jsx`: „Schriftart
  und Grundlayout sind bewusst einheitlich vorgegeben") verändern würde –
  genau die Art Entscheidung, vor der ohne Rücksprache zurückgehalten wird
  (gleiche Regel wie bei den Nachtblau-Farben). Was NICHT von dieser
  Diskrepanz abhängt (Kontrast, Fokus, Skip-Link, Zoom, Motion), wurde ganz
  normal umgesetzt/geprüft – siehe Tabelle oben.
- **42 (Abstände systematisieren):** Leichte Prüfung der zentralen
  gemeinsamen Komponenten (`GlassCard`, `SegmentedControl`, `FilterChips`)
  zeigt bereits konsistente Abstands-/Rundungs-/Größenwerte (Ergebnis der
  Design-Konsolidierung aus einer früheren Runde dieses Projekts). Keine
  konkrete, im Rahmen dieser Prüfung gefundene Inkonsistenz, die einen
  gezielten Fix rechtfertigen würde – eine vollständige Abstands-Audit
  aller ~20 Seiten wäre eine große, subjektive Design-Review-Aufgabe ohne
  nachgewiesenen Bug dahinter und wird zurückgestellt.
- **43, verbleibende Lücke (nutzerdefinierte Bereichsfarben):** Die Farbe je
  Lebensbereich (`AreaBadge`-Punkt, Kalender-Linksrand, Hintergrundtönung)
  ist über `Einstellungen.jsx` frei durch die Nutzerin wählbar
  (Farbwähler) – für nutzerdefinierte Farben lässt sich kein fester
  Kontrast-Fix im Code verankern, ohne eine Laufzeit-Kontrastprüfung samt
  automatischer Farbkorrektur einzuführen (eine eigenständige, größere
  Funktion). Nicht umgesetzt; als bekannte Grenze dokumentiert.
- **45 (vollständige native VoiceOver-Abnahme):** Nur der browserbasierte
  Teil (Skip-Link, Fokus-Trap, sichtbarer Fokus, programmatische
  Tab-Reihenfolge) wurde geprüft und gefixt. **Echte VoiceOver-Tests auf
  einem Mac sind aus dieser Cloud-Linux-Umgebung heraus nicht möglich**
  (kein Zugriff auf macOS/VoiceOver) – dieselbe, bereits in Abschnitt 1–2
  dokumentierte Einschränkung.

## Abschnitt 5 – Native macOS-Hülle und Auslieferung (Punkte 47–52)

**Wichtig zu diesem Abschnitt:** Er zerfällt in zwei völlig unterschiedlich
belastbare Hälften. Backend (`backend/src/index.js`), Frontend (9 Seiten mit
Löschbestätigung) und der Bash/zsh-Anteil von `macos/build-app.sh` sind wie
in allen vorherigen Abschnitten **automatisiert getestet** –
`node --test`/`vite build`/Playwright bzw. tatsächliche Ausführung der
Skript-Logik in dieser Umgebung (zsh ist hier nachinstallierbar, auch ohne
Mac). Die Änderungen an `macos/Sources/PersonalDashboardApp.swift` selbst
sind dagegen **nicht kompiliert und nicht ausgeführt worden** – diese
Cloud-Umgebung hat kein Xcode und keine macOS-Toolchain. Diese Swift-Änderungen
wurden sorgfältig Zeile für Zeile gegen den bestehenden Code und bekannte,
im Quelltext bereits an anderer Stelle verwendete bzw. gut etablierte
WKWebView-/AppKit-API-Signaturen geschrieben, aber es gibt keine Garantie,
dass sie beim ersten Versuch fehlerfrei kompilieren. **Vor dem Ausliefern
zwingend:** `./macos/build-app.sh` auf einem echten Mac mit Xcode
ausführen und die App tatsächlich starten, bevor diese Version als
funktionierend gilt.

| # | Punkt | Was gefunden und geändert wurde | Testbarkeit |
|---|---|---|---|
| 47 | Health-Check ohne Identitätsprüfung | **Bestätigter, konkreter Bug:** `waitForServer()` akzeptierte jede 200-Antwort auf dem gewählten Port als „eigener Server" – ein zufällig denselben Port belegender anderer Prozess, der ebenfalls mit 200 antwortet, wäre unbemerkt durchgegangen. `/api/health` spiegelt jetzt ein pro Start neu erzeugtes `DASHBOARD_INSTANCE_TOKEN` zurück (nur gesetzt von der nativen Hülle, im normalen Server-/Testbetrieb leer → keine Verhaltensänderung dort); die Swift-Seite akzeptiert eine Antwort nur noch, wenn das Token exakt übereinstimmt. | Backend-Teil: **automatisiert getestet** (`backend/test/native-shell.test.js`, 2 neue Tests). Swift-Teil (Token als Env-Var setzen, Antwort parsen und vergleichen): ungeprüft. |
| 47 | Kein Umgang mit Portkollision selbst | Ein belegter Port ließ den Kindprozess sofort mit einem Fehler abstürzen, was direkt zu einer Fehlermeldung führte – kein Wiederholungsversuch. Jetzt: fester bevorzugter Port (51847) mit **einmaligem** automatischem Ausweichen auf einen zufälligen Port aus dem dynamischen Bereich, falls der bevorzugte Port belegt ist, bevor überhaupt eine Fehlermeldung erscheint. | Ungeprüft (Swift). |
| 48 | Sitzung geht bei jedem Neustart verloren | **Bestätigter, konkreter Bug, vermutlich der größte UX-Fehler in diesem Abschnitt:** Der Server-Port wurde bisher bei **jedem** App-Start neu ausgewürfelt. `WKWebsiteDataStore` partitioniert nach vollständiger Origin (Schema+Host+**Port**) – eine neue Origin bei jedem Start bedeutet, dass `localStorage` (und damit das Anmelde-Token) trotz `websiteDataStore = .default()` (persistent konfiguriert) **nie** über einen Neustart hinweg gültig war. Jeder App-Start hätte einen erneuten Login verlangt. Fix: fester bevorzugter Port (siehe Punkt 47) hält die Origin über Neustarts hinweg stabil; nur im seltenen Kollisionsfall (Ausweich-Port) geht die Sitzung für diesen einen Start verloren – ein bewusst akzeptierter, seltener Kompromiss statt eines harten Fehlschlags. | Ungeprüft (Swift) – das eigentliche Origin-/WKWebsiteDataStore-Verhalten lässt sich nur in einem echten WebView auf macOS beobachten. |
| 49 | Navigationsprüfung nur nach Host, nicht vollständiger Origin | **Bestätigter, konkreter Bug:** `decidePolicyFor` prüfte nur `url.host`, nicht Schema oder Port – `https://127.0.0.1:PORT` oder `http://127.0.0.1:ANDERER-PORT` wären ebenfalls durchgegangen. Host-lose URLs (`file:`, `data:`, `javascript:`, beliebige dritte Schemata) fielen mangels `host` sogar komplett durch die Prüfung und wurden stillschweigend **erlaubt** – das Gegenteil von „zusätzliche URL-Schemata nur explizit". Fix: vollständige Origin-Prüfung (Schema **und** Host **und** Port); alles außer der eigenen Origin und `http(s)://` (an den Standardbrowser weitergeleitet) wird jetzt abgelehnt statt stillschweigend geladen. | Ungeprüft (Swift). |
| 50 | Exit-Code 0 wurde absichtlich ignoriert | **Bestätigter, konkreter Bug – exakt der im Prompt benannte Fall:** `terminationHandler` prüfte bisher explizit `process.terminationStatus != 0`, bevor ein Fehler angezeigt wurde. Ein unerwarteter, aber „sauberer" Exit mit Code 0 (z. B. ein Node-Bug, der zu vorzeitigem Prozessende ohne Fehlercode führt) wurde dadurch komplett stillschweigend hingenommen – der WebView hätte eine tote Verbindung gezeigt, ohne dass irgendein Hinweis erscheint. Fix entfernt diese Ausnahme; jeder unerwartete Exit (jeder Code) außer beim eigenen, kontrollierten Beenden zeigt jetzt eine Fehlermeldung mit Exit-Code und Logpfad. | Ungeprüft (Swift). |
| 50 | Kein Wachhund gegen verwaiste Serverprozesse | Stirbt der Swift-Elternprozess nicht sauber (Absturz, „Kill erzwingen"), bekommt der Node-Kindprozess das nie mit und würde unbegrenzt als Waise weiterlaufen. Neuer, nur bei gesetztem Instanztoken aktiver Wachhund im Backend: pollt `process.ppid` alle 5s und beendet sich selbst, sobald sich die Elternprozess-ID ändert (verwaiste Prozesse werden unter POSIX auf launchd/PID 1 umgehängt – so erkennbar, ohne dass das Betriebssystem aktiv benachrichtigen muss). | **Automatisiert getestet** (Teil desselben `native-shell.test.js`, prüft dass ohne Token kein Wachhund startet und der Normalbetrieb unverändert bleibt). Der volle Waisen-Fall selbst (Elternprozess tatsächlich hart beenden) ist im Rahmen dieser Tests nicht simuliert. |
| 50 | Unbegrenztes Log-Wachstum | `dashboard.log` wurde für immer angehängt, ohne Obergrenze. Jetzt: Log wird bei Programmstart neu begonnen, falls es 5 MB überschreitet. Begrenzt Wachstum pro Start-Zyklus, nicht innerhalb einer einzelnen, sehr lange laufenden Sitzung – bewusst einfach gehalten statt einer vollen Rotation. | Ungeprüft (Swift). |
| 51 | JS `alert()`/`confirm()`/`prompt()` funktionierten trotz `uiDelegate` nicht | **Bestätigter, konkreter Bug – exakt die im Prompt benannte Falle:** `webView.uiDelegate = self` war gesetzt, aber keine der drei `WKUIDelegate`-Methoden für Alert-/Confirm-/Prompt-Panels war implementiert. Ohne sie geben `window.confirm()` u. Ä. aus dem Webinhalt lautlos `false`/`undefined` zurück, ohne dass irgendein Dialog erscheint. Alle drei Methoden jetzt mit `NSAlert`-Sheets implementiert – Voraussetzung dafür, dass die neuen Löschbestätigungen (siehe unten) im nativen WebView überhaupt funktionieren. | Ungeprüft (Swift). |
| 51 | Löschbestätigung fehlte komplett | Jedes „Löschen" in der App hat bisher sofort und ohne jede Rückfrage gelöscht – ein Fehlklick verliert unwiderruflich Daten. `window.confirm(...)` vor dem eigentlichen Löschen ergänzt in allen 9 Seiten mit Lösch-Aktion (Aufgaben, Rechnungen, Dokumente, Notizen, Verträge, Ziele, LinkedIn, Prompt-Bibliothek, Gesundheit) – bei „Abbrechen" wird gar nicht erst eine Anfrage geschickt, bei „OK" läuft der bestehende Lösch-Ablauf unverändert weiter. Bewusst **nicht** angefasst: das Entfernen eines einzelnen Meilensteins innerhalb eines Ziels (`Ziele.jsx`) – geringere Tragweite als ein ganzer Datensatz, und die Bereichs-Löschung in den Einstellungen, die bereits eine eigene, ausführlichere Bestätigung mit Mengen-Aufschlüsselung hat. | **Vollständig automatisiert getestet** (Playwright, echter `window.confirm()`-Dialog: Abbrechen lässt den Datensatz und löst keinen Request aus, Bestätigen löscht ihn) – der Frontend-Teil braucht dafür keinen Mac, Chromium implementiert `confirm()` genauso wie WKWebView es tun sollte, sobald Punkt 51 (Delegate) stimmt. |
| 51 | Fehlgeschlagene Downloads ohne Rückmeldung | `WKDownloadDelegate` implementierte nur `decideDestinationUsing`, nicht `didFailWithError` – ein fehlgeschlagener Download (volle Festplatte, Berechtigung, Netzwerkfehler) scheiterte bisher komplett lautlos. Jetzt zeigt ein `NSAlert` den Fehler an. | Ungeprüft (Swift). |
| 51 | Kein Zoom/Textskalierung | Das „Darstellung"-Menü hatte nur „Neu laden" und Vollbild, keine Möglichkeit zur Seitenvergrößerung. Drei neue Menüpunkte (Vergrößern/Verkleinern/Originalgröße, ⌘=/⌘-/⌘0) steuern `webView.pageZoom` (0.5–3.0). | Ungeprüft (Swift). |
| 52 | Keine gepinnte Node-Laufzeit | `build-app.sh` nutzte einfach `command -v node`, ohne jede Versionsprüfung. Neues `backend/package.json#engines` (`>=20.0.0`) plus ein Check im Build-Skript, der bei zu alter Node-Version das Bundling verweigert. | **Getestet**: Die Parsing-/Vergleichslogik (`v22.22.2 → 22 → OK`, `v18.19.0 → 18 → REJECTED` usw.) wurde in dieser Umgebung tatsächlich mit `zsh` ausgeführt (zsh lässt sich hier ohne Mac nachinstallieren) – nur die eigentlichen `xcrun`/`swiftc`/`codesign`-Schritte sind macOS-exklusiv und bleiben ungeprüft. |
| 52 | Fehlgeschlagener Rebuild zerstörte die letzte funktionierende Version | **Bestätigter, konkreter Bug:** Das Skript räumte den Ziel-Ordner (`rm -rf`) auf, **bevor** überhaupt kompiliert wurde – ein Kompilierfehler mitten im Build hätte die zuletzt funktionierende App bereits gelöscht, ohne Ersatz. Neues Verhalten: komplettes Bundle wird in einem separaten Staging-Verzeichnis gebaut, signiert **und** verifiziert (`codesign --verify --deep --strict`); erst danach wird die vorherige Version nach `.previous` verschoben und die neue an ihre Stelle. | **Vollständig getestet** – der komplette Staging-→Verify-→Swap-Mechanismus wurde in dieser Umgebung tatsächlich mit `zsh` simuliert (Fake-Bundle statt echtem Build): ein erfolgreicher Lauf verschiebt korrekt und räumt das Staging-Verzeichnis auf; ein simulierter Fehlschlag mitten im Build lässt die alte, funktionierende „App" unangetastet und hinterlässt kein Staging-Überbleibsel. |
| 52 | Build-Herkunft nirgends sichtbar | Kein Build-Datum, kein Commit, kein Hinweis auf lokale Änderungen irgendwo im gebauten Bundle. Build-Skript schreibt jetzt `DashboardBuildCommit`, `DashboardBuildDirty`, `DashboardBuildTimestamp` und `DashboardBuildNodeVersion` als eigene Zusatzschlüssel in die `Info.plist` der gebauten App (via `PlistBuddy`, nicht `CFBundleVersion` überladen, das macOS für Update-Vergleiche nutzt). | Git-Teil (`rev-parse`, `status --porcelain`) **getestet**, liefert in dieser Umgebung korrekt `commit=23ebdf0 dirty=mit-lokalen-aenderungen`. `PlistBuddy` selbst ist macOS-exklusiv, ungeprüft. |
| 52 | Notarisierung/Developer-ID | Geprüft: weder Skript noch README behaupten fälschlich, notarisiert oder mit Developer-ID signiert zu sein – README nennt bereits korrekt „signiert lokal ad hoc; für Weitergabe an andere Macs sind Developer-ID-Signatur und Notarisierung erforderlich". Kein Änderungsbedarf, Punkt bereits eingehalten. | Bereits korrekt, verifiziert durch Lesen. |

**Bewusst nicht umgesetzt (mit Begründung):**
- **50, Sleep/Wake:** Kein Code zur expliziten Behandlung von
  Systemschlaf/-aufwachen ergänzt. macOS setzt Hintergrundprozesse beim
  Schlaf in der Regel transparent aus und lässt sie beim Aufwachen
  weiterlaufen (kein Kill) – ob das für diese spezifische Kombination aus
  lokalem Node-Server und WKWebView-Verbindung tatsächlich ein Problem
  darstellt (z. B. eine hängende Netzwerkverbindung nach längerem Schlaf),
  lässt sich ohne echte Hardware nicht verifizieren. Lieber ehrlich als
  ungeprüft auflisten, als eine spekulative Änderung ohne jede
  Verifikationsmöglichkeit einzubauen.
- **51, Menüvollständigkeit:** Kein „Fenster"- oder „Hilfe"-Menü ergänzt –
  beide sind macOS-Konvention, aber ohne konkreten gefundenen Fehler dahinter
  reine Kosmetik, zurückgestellt.
- **Native Smoke-Tests aus Abschnitt 6** (Start/Stop/Neustart, Portkollision,
  Downloads, Menüs, Tastatur, VoiceOver, Offlineverhalten): **nicht
  durchführbar in dieser Umgebung.** Das ist keine Auslassung, sondern eine
  harte Umgebungsgrenze – ohne Mac keine native App, kein WKWebView, kein
  VoiceOver.

## Bewusst nicht umgesetzt (mit Begründung)

**Restliche Punkte aus Abschnitt 1–6 (10–12, 22 vollständig, 27, 33):**
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
- **43, 45 (Kontrast, Skip-Link, Fokus-Trap), 44, 46 (Zoom, Motion):**
  inzwischen umgesetzt bzw. geprüft, siehe eigener Abschnitt „Abschnitt 4"
  oben. **40, 41** (Nachtblau-Identität, Editorial-Serif-Typografie)
  bewusst zurückgestellt (Diskrepanz zur echten Waldgrün/Manrope-Identität
  dieses Repos, siehe Begründung oben). **42** (Abstände) nur leicht
  geprüft, keine konkrete Inkonsistenz gefunden. **43** (nutzerdefinierte
  Bereichsfarben) und die native VoiceOver-Abnahme (Teil von 45) bleiben
  aus den oben genannten Gründen offen.
- **47–52 (native macOS-Hülle):** inzwischen bearbeitet, siehe eigener
  Abschnitt „Abschnitt 5" oben – mit der dort direkt am Anfang genannten
  Einschränkung: die Backend-/Frontend-/Build-Skript-Anteile sind getestet,
  die Swift-Änderungen selbst sind **ungeprüft gegen einen Compiler** (kein
  Xcode/macOS-Toolchain in dieser Cloud-Umgebung). Jede Aussage über
  „funktioniert nativ" bliebe unbelegt und wird deshalb nicht gemacht –
  Verifikation auf einem echten Mac ist vor jeder Auslieferung Pflicht.

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

- **Größter offener Punkt dieser Runde:** Die komplette Datei
  `macos/Sources/PersonalDashboardApp.swift` wurde in Abschnitt 5 geändert,
  ohne dass auch nur ein einziges Mal `swiftc` darüber gelaufen ist – diese
  Umgebung hat keine macOS-Toolchain. Die Änderungen wurden mit großer
  Sorgfalt anhand bekannter, im Rest der Datei bereits verwendeter bzw.
  gut dokumentierter API-Signaturen geschrieben, aber „sorgfältig gelesen"
  ist kein Ersatz für „kompiliert und gestartet". Vor jeder tatsächlichen
  Auslieferung dieser Version muss `./macos/build-app.sh` auf einem echten
  Mac laufen und die App danach tatsächlich geöffnet werden.
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
2. Falls später wirklich benötigt: volle Cent-Spalten-Migration für Geld
   (Punkt 23) und vollständig vereinheitlichte Zod-Validierung über alle
   Routen (Punkt 22) – beides mit eigenem, vom Nutzer bestätigtem Anlauf.
3. **Vor jeder Auslieferung zwingend:** `./macos/build-app.sh` auf einem
   echten Mac mit Xcode ausführen und die Swift-Änderungen aus Abschnitt 5
   tatsächlich kompilieren/starten – sie sind bisher nur gegen den
   Quelltext gelesen, nicht gebaut. Dort auch die in Abschnitt 6
   geforderten nativen Smoke-Tests (VoiceOver, Sleep/Wake, Portkollision)
   durchführen; das ist auch der einzige Weg zur vollständigen Abnahme von
   Punkt 45 (VoiceOver) aus Abschnitt 4.
4. Abschnitte 7–11 erst nach Klärung, ob die Nachtblau-Neuausrichtung
   tatsächlich gewollt ist (siehe Diskrepanz oben), und dann in den in §10
   vorgeschlagenen Paketen B–F, nicht als Ganzes.
