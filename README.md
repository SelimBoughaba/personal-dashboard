# Persönliches Dashboard

Lokales Dashboard für Aufgaben, Kalender, Finanzen und mehr – läuft nur im
eigenen Heimnetz, kein öffentliches Hosting, keine Pflicht-Cloud-Dienste.
Design: Nachtblau-Farbsystem, flache Geometrie (keine Glasflächen), Manrope
(siehe „Design-Erweiterung (Paket B)" unten – löste das ursprüngliche
Waldgrün/Glas-Design ab).

**Stand:** Etappe 14 – Erweiterte Kalender- und Aufgabenansichten. Der
Kalender hat jetzt zusätzlich zu Tag/Woche eine Monatsansicht sowie echte
Zurück/Weiter/Heute-Navigation (vorher immer fest auf „heute" verankert).
Aufgaben lassen sich wahlweise als Liste oder als Kanban-Board (Spalten
nach Priorität) anzeigen.

**Damit sind alle Punkte der ursprünglich vereinbarten Reihenfolge
umgesetzt** – kein Navigationspunkt zeigt mehr einen deaktivierten
„bald"-Platzhalter.

**Nachträgliche Politur:** Backend und Datenbank wurden geprüft und laufen
sauber (Installation, Migrationen, Build – siehe „Lokal starten"). Ein Bug
wurde behoben, bei dem der Einrichtungsassistent versehentlich die volle
Seitennavigation zeigte und sich so umgehen ließ. Die Oberfläche wurde
konsistenter gemacht: wiederkehrende Muster (Bereichsfilter, Ansicht-Umschalter,
Seiten-Header, leere Listen, Kennzahlen-Kacheln) sind jetzt gemeinsame
Komponenten statt pro Seite einzeln nachgebauter Buttons, dadurch wirkt jede
Seite wie aus einem Guss statt wie viele Einzelteile.

**Sicherheits-/Zuverlässigkeitshärtung (Paket A):** Auf Basis eines
Prüfberichts wurden Sicherheit/Restore (Abschnitt 1), Datenkonsistenz/
Backend (Abschnitt 2), der Kernbestand von Frontend-Ehrlichkeit (Abschnitt 3),
der messbare Kernbestand von Optik/Barrierefreiheit/Motion (Abschnitt 4) und
die native macOS-Hülle (Abschnitt 5) umgesetzt – Details, Testabdeckung und
bewusst zurückgestellte Punkte stehen in
[`SECURITY_HARDENING.md`](./SECURITY_HARDENING.md). Kurzfassung Abschnitt
1+2: zwei bestätigte konkrete Bugs (ein Routing-Fehler, durch den „Kalender
trennen" die iCloud-Zugangsdaten nie wirklich löschte; ein `Promise.all`,
durch das ein einzelner defekter Kalender die Termine aller anderen mit
verschwinden ließ), ein Race Condition in der Ersteinrichtung, striktere
(typisierte) Backup-Validierung inkl. Pfadsicherheit, vollständige
Bereichsreferenz-Integrität über alle Module, eine echte Speicherordner-
Migration statt bloßem Zeigerwechsel, stabile IMAP-UIDs für die
Rechnungserkennung, Scan-Vorschläge als solche gekennzeichnet,
CSV-Robustheit (inkl. Formel-Injection-Schutz) und sofortiger
Sitzungs-Widerruf bei Passwortwechsel. Kurzfassung Abschnitt 3: ein
Zeitzonen-Bug, durch den kurz nach Mitternacht Lokalzeit „heute fällig"
falsch berechnet wurde (UTC- statt Lokalzeit-Vergleich, betraf Kalender,
Übersicht, Rechnungen, Gesundheit); ganztägige Termine fehlten in der
Kalender-Monatsansicht komplett; ein per Tastatur/Screenreader erreichbares,
aber unsichtbares eingeklapptes Menü; eine Suchpalette, bei der eine
veraltete Antwort eine neuere überschreiben konnte; fehlende
Label/Feld-Verknüpfung auf den meisten Formularseiten; und
Schreibaktionen (Umschalten/Löschen/Anlegen), die Fehler stillschweigend
verschluckten und per Doppelklick doppelt auslösbar waren. Kurzfassung
Abschnitt 4: gemessene (nicht geschätzte) WCAG-2.2-Kontrastwerte deckten
auf, dass der Tastatur-Fokusring im hellen Farbschema praktisch unsichtbar
war (1,1:1 statt der geforderten 3:1) und Formular-Beschriftungen im
dunklen Standard-Farbschema unter dem Mindestkontrast lagen (3,3:1 statt
4,5:1) – beide sowie zu schwacher sekundärer Text an 56 Stellen auf
messbar ausreichenden Kontrast angehoben, ohne die Waldgrün-Identität zu
verändern; dazu ein fehlender Skip-Link und eine Suchpalette ohne echten
Fokus-Trap bzw. ohne Fokus-Rückgabe beim Schließen. Kurzfassung Abschnitt
5 (native macOS-Hülle, `macos/`): der Server-Port wurde bisher bei jedem
App-Start neu zufällig gewählt, wodurch die Anmeldesitzung wegen
WebKits origin-gebundenem Speicher bei **jedem** Neustart verloren ging –
jetzt ein fester Port mit Ausweichlogik nur im (seltenen) Kollisionsfall;
dazu ein Health-Check ohne Identitätsprüfung, eine Navigationsprüfung, die
nur den Host statt der vollständigen Origin kontrollierte, ein absichtlich
ignorierter Exit-Code 0 beim Server-Absturz, fehlende native
Löschbestätigungen (jetzt in allen 9 betroffenen Seiten ergänzt) und ein
Build-Skript, das einen fehlgeschlagenen Rebuild bereits vor dem
eigentlichen Kompilieren gelöscht hätte. **Wichtige Einschränkung:** Diese
Cloud-Sitzung hat kein Xcode – die Swift-Änderungen selbst sind sorgfältig
geschrieben, aber nicht kompiliert; vor jeder Auslieferung muss
`./macos/build-app.sh` auf einem echten Mac laufen. Danach noch eine
Folgerunde zu zwei zuvor zurückgestellten Punkten: `npm audit`-Funde nach
tatsächlicher Erreichbarkeit statt blind geprüft (die einzige wirklich
erreichbare Backend-Lücke behoben, ohne Express zu aktualisieren; die
übrigen Funde brauchen riskante Major-Updates für nicht erreichbaren
Code und wurden bewusst nicht geforct) sowie vier Routen (Aufgaben,
Verträge, Ziele, LinkedIn-Beiträge) auf gemeinsame Zod-Validierung
umgestellt – dabei einen echten Bug gefunden und behoben, bei dem
Notizen/Prompts sich per Teil-Update auf komplett leeren Titel/Inhalt
setzen ließen.

**Design-Erweiterung (Paket B):** Neues Nachtblau-Farbsystem, eine klare
Typografie-Skala und flache Geometrie (keine Glasflächen mehr) ersetzen
das bisherige Waldgrün/Glas-Design. Die Übersicht zeigt jetzt eine
Tageslinie (Termine/Fristen chronologisch in einer Spalte) statt einer
Kachelwand, mit einer Vorgangsakte für Details zu einzelnen Einträgen -
dasselbe Vorgangsakte-Grundgerüst (Auswahl + Detailbereich seitlich auf
breiten, vollflächig auf schmalen Fenstern) gibt es inzwischen auch bei
Rechnungen und Verträgen, dort mit einer belegten Ereignisfolge
("Angelegt/Eingegangen → Geprüft → Bezahlt", nur tatsächlich gespeicherte
Zeitpunkte) bzw. einer Fristmarkierung (Kündigungsfrist, Verlängerung).
Rechnungen haben zusätzlich eine Kostenverlauf-Grafik. Gespeicherte
Arbeitsansichten (Filterkombinationen benennen und pinnen) sowie
Kontextlinks (manuell gesetzte, sichtbare Verknüpfungen zwischen
Aufgaben, Rechnungen, Dokumenten, Verträgen, Zielen und Notizen) ergänzen
mehrere Module.

**Arbeitsabläufe (Paket C):** Aufgaben können jetzt wiederkehren
(täglich/wöchentlich/monatlich, mit einer Rückstands-Deckelung statt
unkontrollierter Serien-Nachholung nach längerer Abwesenheit). Ziele
lassen sich mit anderen Objekten verknüpfen und bekommen einen selbst
gewählten Überprüfungsturnus. Ein Fokusmodus (rein lokal, kein
verstecktes Tracking, keine Streaks) sowie ein Wochenrückblick (reine
Zählungen/Kurztitel aus echten Daten statt motivationaler KI-Erzählung;
ein abgeschlossener Rückblick wird als datensparsamer, unveränderlicher
Snapshot gespeichert) helfen beim Innehalten. Ein Benachrichtigungszentrum
bündelt Fristen, Hintergrundereignisse und Integrationsfehler mit
Ruhezeiten, Kategorie-Steuerung und optionalen (standardmäßig
vorschau-freien) nativen Mitteilungen. Ein lokaler Papierkorb macht
„Löschen" auf den neun wichtigen Inhaltstypen 30 Tage lang rückgängig
machbar (bei Dokumenten inklusive der zugehörigen Datei), danach wird
automatisch endgültig aufgeräumt – ohne eigenen Hintergrunddienst.

**Vorgänge (Paket D, Punkt 69 vollständig):** Ein neuer Inhaltstyp
„Vorgang" (Titel, Beschreibung, Bereich, Status) bündelt Aufgaben,
Notizen, Dokumente, Rechnungen, Verträge und Ziele unter einem
gemeinsamen Namen. Bewusst kein eigenes Beziehungsmodell: das Bündeln
sind ganz normale Kontextlinks zwischen dem Vorgang und den gebündelten
Objekten (dieselbe Verknüpfungsfunktion wie überall sonst), kein
Team-Projektmanagement mit Rollen, Sprints oder Pflichtprozessen. Die
eigene Seite „Vorgänge" nutzt dasselbe Vorgangsakte-Grundgerüst wie
Rechnungen/Verträge; Vorgänge sind außerdem durchsuchbar und Teil des
Papierkorbs.

**Finanzieller Ausblick (Paket D, Punkt 71):** Auf „Finanzen" fasst ein
neuer Abschnitt offene Rechnungen und wiederkehrende Verträge zu einer
30-/90-Tage-Vorschau zusammen, getrennt nach bereits Bezahlt, Geplant
und Unklar (fehlender Betrag oder fehlendes Datum). Monatliche/jährliche
Verträge werden anhand von Verlängerungsdatum und Abrechnungszyklus
projiziert; eine über Kontextlinks mit einem Vertrag verknüpfte Rechnung
wird für denselben Abrechnungszyklus nur einmal gezählt. Bewusst **kein
Kontostand und keine verfügbare Liquidität** – ohne Bankanbindung würde
das nur vorgetäuscht; eine Bankanbindung bleibt eine mögliche spätere,
eigenständige Entscheidung.

**Vertrauen & Einrichtung (Paket D, Punkt 80):** Neue Seite unter „Mehr"
zeigt Speicherort (Datenbank- und Dokumentenordner samt Größe), die
letzte VERIFIZIERTE Sicherung (der Export durchläuft direkt danach
dieselbe strenge Prüfung wie ein Restore - nicht nur "heruntergeladen"),
den Integrationszustand (Kalender wird bei jedem Aufruf dieser Seite
live neu geprüft; E-Mail bewusst nicht - ein IMAP-Test hätte
Seiteneffekte, siehe notifications.js - stattdessen der zuletzt
tatsächlich aufgetretene Fehler, nie ein unbelegtes "verbunden"),
Datenfrische je Inhaltstyp, die Browser-Benachrichtigungsberechtigung
und ausstehende lokale Hintergrundjobs - ehrlich "keine", da diese App
bewusst keinen Cron/Hintergrunddienst hat (alles läuft bedarfsgesteuert
beim jeweiligen Seitenaufruf). Die Ersteinrichtung (schrittweise,
optionale Schritte wie Kalender/E-Mail überspringbar) gab es bereits vor
diesem Punkt; einen Demo-Modus gibt es in dieser App nicht - "isoliert
und gekennzeichnet, falls es ihn gäbe" ist damit gegenstandslos.

**Dokumentarbeitsplatz (Paket D, Punkt 72, ohne die zurückgestellte
lokale OCR/Texterfassung):** Details siehe „Dokumente-Modul" weiter
unten - sichere, byte-geprüfte Inline-Vorschau für Bilder/PDF und
SHA-256-Dateiduplikathinweise als reine, nicht blockierende Hinweise.

**Lokaler Suchindex mit SQLite-FTS5 (Paket D, Punkt 86):** Details siehe
„Globale Suche / Kommandopalette" weiter unten - Präfix-Treffer,
UND-verknüpfte Mehrwortsuche und `bm25()`-Ranking über echte FTS5-
Indizes statt `LIKE`-Abfragen, mit denselben Suchfeldern wie zuvor
(keine Ausweitung auf sensiblere Inhalte).

**Kapazitätsleiste (Paket D, Rest von Punkt 60):** Auf der Übersicht
zeigt „Kapazität heute" die heutigen Kalendertermine mit bekannter
Uhrzeit auf einer echten 24-Stunden-Achse (00–24 Uhr) - bewusst keine
erfundene Tageskapazität wie eine angenommene Arbeitszeit als
Bezugsgröße. Die verplante Zeit wird über eine Intervallvereinigung
berechnet, damit sich überschneidende Termine nicht doppelt gezählt
werden. Ganztägige Termine haben keine bekannte Zeitspanne und werden
ausgeschlossen und benannt statt als 0-Dauer-Block gezählt. Mit
Textzusammenfassung, Einheiten, Quelle, Datenstand und einer
zugänglichen Tabellenalternative, wie schon der Kostenverlauf bei
Rechnungen.

`cd backend && npm test` führt die inzwischen 158 automatisierten
Backend-Tests aus, `cd frontend && npm test` 4 weitere für die
Zeitzonen-Korrektur.

## Projektstruktur

- `backend/` – Express-API + SQLite (`better-sqlite3`)
- `frontend/` – React (Vite) + Tailwind CSS

## Lokal starten

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Der Server läuft dann auf `http://localhost:4000` (bzw. `http://<Mac-IP>:4000`
für Zugriff vom iPhone im selben WLAN). Ein `.env` ist **nicht mehr
zwingend erforderlich** – siehe „Ersteinrichtung" unten. Wer eine
`backend/.env` mitbringt (z. B. aus einer älteren Version), dessen Werte
werden beim allerersten Start automatisch übernommen.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Öffnet unter `http://localhost:5173`. Im Dev-Modus leitet Vite `/api`-Anfragen
an den Backend-Server auf Port 4000 weiter.

### 3. Ersteinrichtung

Beim allerersten Öffnen der App (kein Passwort in der Datenbank vorhanden)
erscheint statt des Login-Formulars ein Bildschirm „Passwort festlegen".
Danach führt ein zehnschrittiger Einrichtungsassistent (`/einrichtung`)
einmalig durch: Profil, Lebensbereiche, Erklärung zum Datenstandort,
Kalender-Verbindung, E-Mail-Verbindung, Dokumente-Speicherort, Finanzen
(inkl. CSV-Import), Benachrichtigungen und Datenschutz-Übersicht. Jeder
optionale Schritt lässt sich überspringen, der Fortschritt wird nach jedem
Schritt in der Datenbank gespeichert – der Assistent lässt sich also
jederzeit schließen und beim nächsten Login genau dort fortsetzen, wo man
aufgehört hat. Nach Abschluss landet man auf einer personalisierten
Übersicht.

Alles, was im Assistenten eingegeben wird, lässt sich später jederzeit
unter „Einstellungen" ändern – der Assistent ist nur eine geführte
Erstbefüllung derselben Einstellungen.

### 4. Zugriff vom iPhone

Mac-IP im selben WLAN herausfinden (Systemeinstellungen → WLAN → Details),
dann auf dem iPhone `http://<Mac-IP>:5173` (Dev) bzw. später die produktive
Adresse öffnen. Für den Dauerbetrieb: `npm run build` im Frontend, danach
liefert der Backend-Server (`npm start` in `backend/`) das gebaute Frontend
automatisch mit aus – dann reicht eine einzige Adresse `http://<Mac-IP>:4000`.

## Native macOS-App bauen

Das Repository enthält eine native AppKit-/WKWebView-Hülle. Sie startet den
Express-Server unsichtbar auf einer zufälligen, nur lokal erreichbaren Adresse,
zeigt das React-Dashboard in einem normalen macOS-Fenster und beendet den Server
zusammen mit der App. Node.js und alle Produktionsabhängigkeiten werden in das
App-Bundle kopiert; zum späteren Start der fertigen App ist daher keine separate
Node-Installation nötig.

Voraussetzungen für den Build: macOS 13 oder neuer, Xcode Command Line Tools,
Node.js und npm. Dann im Projekt-Root:

```bash
./macos/build-app.sh
open "macos/build/Personal Dashboard.app"
```

Die fertige App liegt unter `macos/build/Personal Dashboard.app` und kann in
den Programme-Ordner gezogen werden. Der Build ist für die Architektur des
Macs bestimmt, auf dem das Skript läuft. Das Skript signiert lokal ad hoc; für
die Weitergabe an andere Macs sind eine Apple-Developer-ID-Signatur und
Notarisierung erforderlich.

App-Daten und Logs liegen updatefest unter:

```text
~/Library/Application Support/Personal Dashboard/
```

Standardmäßig verwendet die App den Portal-Entwurf unter
`macos/IconAlternatives/03-portal.png`. Ein anderes quadratisches PNG lässt
sich beim Build direkt als App-Icon nutzen:

```bash
ICON_SOURCE=/absoluter/pfad/icon.png ./macos/build-app.sh
```

Vier vorbereitete Entwürfe liegen unter `macos/IconAlternatives/`; Hinweise
zur Auswahl stehen in der dortigen `README.md`.

## Einstellungen

Unter „Einstellungen" (auch über „Mehr" in der Sidebar erreichbar) gibt es
elf Unterbereiche, alle serverseitig in SQLite gespeichert und sofort auf
allen Geräten sichtbar, die auf denselben Server zugreifen:

1. **Profil** – Name, Begrüßungstext auf der Übersicht.
2. **Darstellung** – reduzierte Bewegung/Animationen (`prefers-reduced-motion`
   wird zusätzlich automatisch respektiert, auch ohne diese Einstellung).
3. **Lebensbereiche** – frei anlegen, umbenennen, Farbe wählen, archivieren,
   umsortieren. Löschen eines Bereichs, dem noch Aufgaben oder Rechnungen
   zugeordnet sind, verlangt vorher eine explizite Zuordnung der
   betroffenen Einträge zu einem anderen Bereich (kein stilles Datenverlust-
   Risiko). Der letzte verbleibende Bereich lässt sich nicht löschen.
4. **Dashboard** – Kacheln auf der Übersicht ein-/ausblenden und per
   Drag-Reihenfolge anpassen; die Auswahl wird pro Server gespeichert.
5. **Kalender** – iCloud-CalDAV-Zugangsdaten eintragen und testen.
6. **E-Mail** – beliebig viele IMAP-Postfächer hinzufügen/entfernen/
   pausieren, Verbindung testen, Absender-zu-Bereich-Zuordnungsregeln
   pflegen.
7. **Dokumente und Speicherort** – Basis-Ordnerpfad für das künftige
   Dokumente-Modul hinterlegen (das Modul selbst folgt in einer späteren
   Etappe).
8. **Benachrichtigungen** – lokale Vorlieben (Vorlaufzeit für Termine u. Ä.),
   es gibt aktuell keinen externen Push-Versand.
9. **Datenschutz und Sicherheit** – ehrliche Übersicht, was wo gespeichert
   wird und welche Einschränkungen bestehen (siehe Abschnitt unten).
10. **Import und Export** – CSV-Import/-Export für Rechnungen, vollständiger
    JSON-Export aller Daten.
11. **Sicherung und Wiederherstellung** – Backup-Datei herunterladen bzw.
    aus einer Backup-Datei mit Vorschau wiederherstellen.

## Was wird lokal gespeichert?

Alles liegt in einer einzigen SQLite-Datei unter `backend/data/dashboard.db`
(WAL-Modus, `-shm`/`-wal`-Begleitdateien sind Laufzeit-Cache derselben
Datenbank). Es gibt keine externe Datenbank und keinen Cloud-Sync-Dienst.
Gespeichert werden u. a.:

- Aufgaben, Termine-Cache, Rechnungen
- Hochgeladene Dokumente als Dateien im konfigurierten Speicherordner
  (Standard: `backend/data/documents/`, unter Einstellungen → Dokumente
  und Speicherort auf einen beliebigen absoluten Pfad auf der Platte
  änderbar – der Server hat vollen Dateisystemzugriff, anders als ein
  Browser); die zugehörigen Metadaten (Titel, Bereich, Tags, Originalname)
  liegen in der Datenbank
- Lebensbereiche (Name, Farbe, Reihenfolge, Archiv-Status)
- Alle Einstellungen (Profil, Darstellung, Dashboard-Konfiguration,
  Benachrichtigungs-Vorlieben, Onboarding-Fortschritt)
- **Zugangsdaten für Kalender (iCloud-App-Passwort) und E-Mail-Konten
  (IMAP-Passwörter) – im Klartext.** Das ist eine bewusste, aber wichtige
  Einschränkung, siehe nächster Abschnitt.
- Der bcrypt-Hash des Dashboard-Passworts und ein automatisch erzeugtes
  JWT-Signaturgeheimnis.

Ein `.env` in `backend/` wird nur noch als **einmaliger Fallback beim
allerersten Start** gelesen (z. B. für Alt-Installationen); danach ist die
Datenbank die alleinige Quelle der Wahrheit, und alles ist über die
Oberfläche änderbar.

### Ehrliche Sicherheitseinschränkung: Klartext-Zugangsdaten

Browser haben keinen Zugriff auf den macOS-Schlüsselbund, und Safari
unterstützt die File System Access API nicht – beides wären Wege, um
Zugangsdaten außerhalb der App-Datenbank sicher abzulegen. Deshalb speichert
diese App Kalender- und Mail-Zugangsdaten aktuell **im Klartext** in
`dashboard.db`. Das ist dieselbe Vertrauensgrenze wie die lokale
Festplatte selbst: Wer physischen oder Netzwerkzugriff auf den Mac bzw. das
Backup hat, kann diese Zugangsdaten lesen. Das ist keine im Hintergrund
verschleierte Schwäche, sondern wird in der App unter „Einstellungen →
Datenschutz und Sicherheit" sowie hier bewusst offengelegt. Eine
Verschlüsselung dieser Werte ist als spätere Verbesserung denkbar, aber
noch nicht umgesetzt.

## Welche externen Verbindungen funktionieren wirklich?

Es wird nirgends eine erfolgreiche Verbindung simuliert. Ein
„Verbindung testen"-Button meldet immer das echte Ergebnis des
tatsächlichen Verbindungsversuchs – bei falschen Zugangsdaten also eine
echte Fehlermeldung, nie ein Fake-Erfolg.

**Funktioniert bereits:**

- **Kalender via iCloud CalDAV** – mit einem App-spezifischen Apple-ID-
  Passwort (nicht dem normalen Passwort). Einrichtung unter Einstellungen
  → Kalender oder im Assistenten.
- **E-Mail via generisches IMAP** (getestet mit IONOS, sollte mit jedem
  Standard-IMAP-Postfach funktionieren) – beliebig viele Konten, mit
  Bereichs-Zuordnung nach Absenderadresse.
- **Rechnungserkennung aus PDF-Anhängen** – nutzt eine der eingerichteten
  IMAP-Verbindungen, durchsucht die letzten 90 Tage nach Anhängen.

**Vorbereitet, aber noch nicht angebunden** (erscheint ehrlich als „noch
nicht verfügbar", nicht als funktionierende Option):

- Google Calendar / Gmail über OAuth (technisch ohne Cloud-Pflicht machbar,
  aber eine eigene Etappe – App-Registrierung bei Google nötig)
- Native Apple-Calendar-Integration ohne CalDAV-Umweg (würde einen
  nativen Helper auf dem Mac voraussetzen, den es (noch) nicht gibt)
- Microsoft/Outlook-Postfächer (Microsoft hat klassisches Passwort-IMAP
  2022 abgeschaltet, würde eine eigene OAuth2/Azure-Anbindung brauchen)

## CSV-Import/-Export

Unter „Finanzen" (Rechnungen) sowie unter Einstellungen → Import und
Export:

- **Export:** lädt alle Rechnungen als `;`-getrennte CSV-Datei (deutsche/
  Excel-Konvention, damit Beträge mit Komma als Dezimaltrennzeichen nicht
  mit dem Spaltentrenner kollidieren) mit UTF-8-BOM für korrekte Umlaute
  in Excel.
- **Import:** CSV-Datei auswählen, jede Zeile wird einzeln validiert;
  fehlerhafte Zeilen werden übersprungen und gezählt, gültige Zeilen
  werden in einer Transaktion eingefügt. Rückmeldung zeigt, wie viele
  Zeilen importiert bzw. übersprungen wurden.

## Backup & Wiederherstellung

Unter Einstellungen → Sicherung und Wiederherstellung:

- **Backup erstellen:** „Backup herunterladen" lädt eine vollständige
  JSON-Kopie aller lokalen Daten herunter – **inklusive** der oben
  beschriebenen Klartext-Zugangsdaten. Die Datei entsprechend sicher
  aufbewahren (z. B. nicht unverschlüsselt in einer Cloud ablegen).
  **Wichtig:** Bei Dokumenten enthält das Backup nur die Metadaten (Titel,
  Bereich, Tags, Originalname), nicht die eigentlichen Dateiinhalte –
  sonst würde die JSON-Datei unkontrolliert groß. Den Dokumente-
  Speicherordner (siehe oben) daher separat sichern, z. B. per Time
  Machine oder manuellem Kopieren.
- **Wiederherstellen:** Backup-Datei auswählen → die App zeigt zunächst
  nur eine **Vorschau** (Anzahl Aufgaben/Rechnungen/Bereiche, Erstellungs-
  zeitpunkt), ohne etwas zu verändern. Erst nach explizitem Klick auf
  „Jetzt überschreiben & wiederherstellen" werden alle aktuellen lokalen
  Daten unwiderruflich durch den Inhalt der Backup-Datei ersetzt
  (serverseitig transaktional, alles-oder-nichts). Der Button ist bewusst
  von der Vorschau getrennt und deutlich als destruktiv gekennzeichnet.

## Dokumente-Modul

Unter „Dokumente" in der Sidebar:

- **Hochladen:** Datei auswählen, optional Titel (sonst wird der
  Dateiname übernommen), Lebensbereich und mit Komma getrennte Tags
  angeben. Die Datei wird auf der Platte im konfigurierten Speicherordner
  abgelegt (siehe oben), unter einem intern generierten, kollisionsfreien
  Namen – Original-Dateiname und Titel bleiben unabhängig davon erhalten
  und werden angezeigt.
- **Liste, Filter, Suche:** nach Lebensbereich filterbar, Volltextsuche
  über Titel und Original-Dateinamen.
- **Bearbeiten:** Titel, Bereich und Tags nachträglich änderbar, ohne die
  Datei neu hochzuladen.
- **Herunterladen:** lädt die Originaldatei mit ihrem ursprünglichen
  Dateinamen herunter.
- **Löschen:** verschiebt Datenbank-Eintrag und Datei in den Papierkorb
  (30 Tage wiederherstellbar, siehe „Lokaler Papierkorb" oben), danach
  werden beide endgültig entfernt.
- **Dokumentarbeitsplatz (Punkt 72, ohne die zurückgestellte lokale OCR/
  Texterfassung):** Ein Klick öffnet die Dokumentakte (dasselbe
  Vorgangsakte-Grundgerüst wie bei Rechnungen/Verträgen/Vorgängen) mit
  einer **sicheren Inline-Vorschau** für Bilder (PNG/JPEG/GIF/WEBP) und
  PDF. Die Vorschau vertraut dabei nie dem vom Client beim Upload
  behaupteten Dateityp, sondern prüft die tatsächlichen Dateibytes
  (Magic-Bytes) - eine als Bild getarnte HTML-/Skriptdatei bekommt keine
  Inline-Vorschau (bewusst kein `image/svg+xml`, da SVG eingebettetes
  JavaScript enthalten kann). Nicht erkannte Formate zeigen einen
  Hinweis statt eines Downloads. Jeder Upload berechnet zusätzlich einen
  SHA-256-Hash des Dateiinhalts; liegt bereits eine inhaltsgleiche Datei
  vor, erscheint ein reiner **Hinweis** ("Eine Datei mit identischem
  Inhalt liegt bereits vor") - beide Dateien bleiben unabhängig
  bestehen, nichts wird automatisch zusammengeführt oder gelöscht. Über
  die Dokumentakte lässt sich ein Dokument außerdem mit Aufgaben,
  Rechnungen, Verträgen, Zielen, Notizen und Vorgängen verknüpfen
  (dieselben Kontextlinks wie überall sonst).

## Verträge & Abos

Unter „Mehr" → „Verträge & Abos" in der Sidebar:

- Vertrag anlegen mit Anbieter, Kosten, Abrechnungszyklus (monatlich/
  jährlich/einmalig/sonstig), nächstem Verlängerungs-/Fälligkeitsdatum,
  Kündigungsfrist (in Tagen vor der Verlängerung) und Status (aktiv/
  gekündigt/abgelaufen).
- Die App berechnet daraus den letzten möglichen Kündigungstermin und
  zeigt aktive Verträge, deren Kündigungsfrist innerhalb von 30 Tagen
  abläuft (oder bereits abgelaufen ist), oben auf der Seite als Warnung
  an. Das ist eine **In-App-Anzeige beim Öffnen der Seite**, keine
  Push- oder E-Mail-Benachrichtigung bei geschlossener App – dafür gibt
  es aktuell keinen Versandweg (siehe „Benachrichtigungen" in den
  Einstellungen).
- **Fristenradar, zweite Stufe (Punkt 70):** rückt eine Kündigungsfrist
  auf 30 Tage oder weniger heran, legt die App zusätzlich zur Warnung
  automatisch eine mit dem Vertrag verknüpfte Aufgabe „Kündigungsfrist
  prüfen: …" an (Priorität Hoch, fällig am Fristende) – sichtbar sowohl
  unter „Aufgaben" als auch in der Vorgangsakte des Vertrags. Kein Cron:
  die Prüfung läuft lazy bei jedem Abruf der Vertragsliste mit, wie der
  Papierkorb-Ablauf. Pro Frist entsteht nur eine Aufgabe; ändert sich das
  Verlängerungsdatum oder die Kündigungsfrist, gilt das als neue Frist
  und eine neue Aufgabe kann entstehen (die alte bleibt unverändert
  bestehen). Keine automatische Kündigung, keine Rechtsauskunft – nur
  eine Erinnerung zum selbst Prüfen.
- Nach Bereich filterbar, wie die übrigen Module.

## Ziele

Unter „Ziele" in der Sidebar:

- Ziel anlegen mit Titel, Beschreibung, Bereich, optionalem Zieldatum und
  Status (aktiv/erreicht/abgebrochen).
- Meilensteine sind eine einfache Checkliste je Ziel (Text + erledigt/
  offen), direkt in der Zielkarte hinzufügbar, abhakbar und löschbar.
- **Fortschritt wird nicht frei erfunden manuell eingegeben, sondern aus
  den Meilensteinen berechnet**, sobald mindestens einer angelegt ist
  (Prozentsatz der abgehakten Meilensteine) – so kann der angezeigte
  Fortschritt nie von den tatsächlich erledigten Schritten abweichen. Ohne
  Meilensteine steht der Fortschritt bei 0 %.
- Es gibt aktuell **keine Verknüpfung mit dem Aufgaben-Modul** (Meilensteine
  sind eine eigene, einfache Liste je Ziel, keine echten Aufgaben-
  Datensätze) – das wäre eine mögliche spätere Erweiterung.

## Notizen

Unter „Mehr" → „Notizen" in der Sidebar:

- Notiz anlegen mit Titel (optional), Inhalt, Bereich und mit Komma
  getrennten Tags.
- Angepinnte Notizen (Stern-Symbol) erscheinen immer zuerst, unabhängig
  vom Bereichsfilter.
- Volltextsuche über Titel und Inhalt, zusätzlich nach Bereich filterbar.
- Keine Formatierung (kein Markdown/Rich-Text) – reiner Text, mit
  erhaltenen Zeilenumbrüchen.

## Gesundheit

Unter „Mehr" → „Gesundheit" in der Sidebar:

- Eintrag anlegen mit Datum, Typ (Gewicht/Schlaf/Sport/Sonstiges,
  jeweils mit sinnvoller Standardeinheit, die frei überschreibbar ist),
  Wert und Notiz.
- Liste sortiert nach Datum absteigend, nach Typ filterbar.
- Neben jedem Wert erscheint ein Trend-Pfeil (↑/↓/→) im Vergleich zum
  vorherigen Eintrag desselben Typs.
- **Bewusst keine Anbindung an Apple Health, Wearables oder andere
  Gesundheits-Apps** – alle Werte werden manuell eingetragen. Es gibt
  auch **keine Zuordnung zu Lebensbereichen**, da Gesundheitsdaten
  bereichsübergreifend sind.

## Globale Suche / Kommandopalette

Öffnen mit **Strg+K** (Windows/Linux) bzw. **Cmd+K** (Mac), über den
Such-Button oben in der Sidebar (Desktop) oder das Lupen-Symbol im
mobilen Header:

- Ohne Eingabetext zeigt die Palette eine Liste aller Hauptseiten zum
  schnellen Wechseln.
- Mit Eingabetext durchsucht sie server-seitig Aufgaben (Titel/Notizen),
  Rechnungen (Absender/Betreff), Dokumente (Titel/Dateiname), Verträge
  (Titel/Anbieter), Ziele (Titel/Beschreibung), Notizen (Titel/Inhalt),
  Prompts (Titel/Inhalt), LinkedIn-Beiträge (Inhalt) und Vorgänge (Titel/
  Beschreibung) gleichzeitig, gruppiert nach Kategorie (max. 5 Treffer pro
  Kategorie).
- Ein Klick auf einen Treffer navigiert zur jeweiligen Modul-Seite (z. B.
  „Aufgaben" oder „Notizen") – **kein Deep-Link zu einem einzelnen,
  hervorgehobenen Eintrag** innerhalb der Seite, das wäre ein größerer
  Umbau der einzelnen Module und ist als spätere Verbesserung denkbar.
- **Lokaler Suchindex mit SQLite-FTS5 (Paket D, Punkt 86):** Die Suche
  läuft über echte FTS5-Volltextindizes statt über `LIKE`-Abfragen -
  Wortpräfix-Treffer (z. B. findet „Steuererkl" schon „Steuererklärung"),
  mehrere Wörter werden UND-verknüpft, Ranking über FTS5' eingebautes
  `bm25()`. Ein Index pro Tabelle wird über SQL-Trigger bei jedem
  Anlegen/Ändern/Löschen automatisch synchron gehalten (kein
  Hintergrundjob, kein manueller Neuaufbau nötig - siehe Migration 0025
  in `backend/src/migrations.js` für die vollständige Begründung
  inklusive des dokumentierten `INSERT INTO <tabelle>_fts(<tabelle>_fts)
  VALUES('rebuild')`-Befehls für den seltenen Fall eines manuellen
  Neuaufbaus). Die Originaltabellen bleiben Quelle der Wahrheit: der
  Index selbst entscheidet nie über Sichtbarkeit im Papierkorb, das
  übernimmt weiterhin ein `deleted_at IS NULL`-Filter in der eigentlichen
  Abfrage. **Bewusst nicht durchsucht:** Mail-Inhalte, Gesundheitswerte
  und alles in den Einstellungen (Kalender-/Mail-Zugangsdaten,
  Passwort-Hash) - Geheimnisse werden nie indexiert, keine Ausweitung
  über die bisherigen Suchfelder hinaus. Kein Fuzzy-Matching/keine
  Tippfehler-Toleranz, keine Cloud-Embeddings oder Vektordatenbank.

## Kalender-Sync einrichten (iCloud)

1. App-spezifisches Passwort erzeugen: auf [appleid.apple.com](https://appleid.apple.com)
   anmelden → „Anmelden & Sicherheit" → „App-spezifische Passwörter" → neues
   Passwort erstellen (Name z. B. „Dashboard"). **Nicht** das normale
   Apple-ID-Passwort verwenden, das funktioniert nicht.
2. Unter Einstellungen → Kalender (oder im Einrichtungsassistenten)
   Apple-ID und das App-Passwort eintragen und mit „Verbindung testen"
   prüfen.
3. Termine (inkl. wiederkehrender Termine) erscheinen im Tab „Kalender" in
   Tages-, Wochen- und Monatsansicht, farblich nach Lebensbereich
   filterbar. Zurück-/Weiter-Pfeile sowie ein „Heute"-Button navigieren
   durch die jeweils gewählte Ansicht.
4. **Einschränkung:** Termine lassen sich nur ansehen, nicht in der App
   selbst anlegen oder bearbeiten – dafür weiterhin die Kalender-App auf
   dem Mac/iPhone nutzen. Ein Schreibzugriff auf das externe Kalenderkonto
   wäre ein größerer, risikoreicherer Umbau (versehentliches Überschreiben
   echter Termine) und ist bewusst nicht Teil dieser Etappe.

## Mail-Modul einrichten

1. IMAP muss im Postfach aktiviert sein. Host/Port findest du in den
   Kontoeinstellungen deines Anbieters (bei IONOS meist `imap.ionos.de`,
   Port `993`).
2. Unter Einstellungen → E-Mail ein Konto hinzufügen (Kennung,
   Anzeigename, Host, Port, Benutzername, Passwort) und mit
   „Verbindung testen" prüfen.
3. Optional: Absender bestimmten Lebensbereichen zuordnen (Domain oder
   vollständige Adresse). Nicht zugeordnete Mails laufen unter dem
   Standardbereich.

## Rechnungs-Automatisierung

Voraussetzung: mindestens ein E-Mail-Konto ist eingerichtet.

1. Im Tab „Rechnungen" auf „Postfächer durchsuchen" klicken. Die letzten
   90 Tage werden nach PDF-Anhängen durchsucht (max. 150 Mails pro
   Postfach), Betrag, Fälligkeitsdatum und Absender werden automatisch
   erkannt.
2. Bereits gefundene Anhänge werden bei erneutem Scan nicht doppelt
   angelegt.
3. Erkennung ist heuristisch (Schlüsselwörter wie „Gesamtbetrag",
   „Fälligkeitsdatum" plus Muster für deutsche Zahlenformate) – **nicht
   immer perfekt**. Über „Bearbeiten" lassen sich Betrag, Fälligkeitsdatum,
   Absender und Bereich jederzeit manuell korrigieren. Rechnungen ohne
   Mail-Bezug (z. B. Papierbelege) lassen sich über „+ Rechnung" auch
   direkt manuell anlegen.

## Als App aufs iPhone installieren (PWA)

Voraussetzung: Backend läuft im **Produktionsmodus** (liefert das gebaute
Frontend mit aus), sonst fehlt der Service Worker im Dev-Modus von Vite:

```bash
cd frontend && npm run build
cd ../backend && npm start
```

1. Auf dem iPhone im selben WLAN mit **Safari** (nicht Chrome – „Zum
   Home-Bildschirm" für PWAs funktioniert auf iOS nur in Safari) die Adresse
   `http://<Mac-IP>:4000` öffnen und anmelden.
2. Teilen-Symbol (Quadrat mit Pfeil nach oben) → „Zum Home-Bildschirm".
3. Icon erscheint auf dem Home-Bildschirm und startet die App im
   Vollbildmodus ohne Safari-Oberfläche.

**Offline-Verhalten:** Bereits geladene Daten (Aufgaben, Termine, Mails,
Rechnungen) bleiben bei fehlendem Netz sichtbar (letzter bekannter Stand,
gecacht via Service Worker). Neue Daten anlegen/bearbeiten braucht weiterhin
eine Verbindung zum Server im Heimnetz. Nach Codeänderungen am Frontend
(`npm run build` + Server neu starten) aktualisiert sich die App auf dem
iPhone automatisch beim nächsten Öffnen.

## Sicherheit

- Passwort wird nur als bcrypt-Hash gespeichert, nie im Klartext.
- Zugriff nur mit gültigem JWT (30 Tage gültig, dann erneut anmelden). Das
  JWT-Signaturgeheimnis wird beim ersten Start automatisch zufällig erzeugt
  und in der Datenbank gespeichert, falls kein sicherer Wert vorkonfiguriert
  ist – kein manuelles `openssl`-Kommando mehr nötig.
- **Ersteinrichtung statt Startup-Blockade:** Frühere Versionen verweigerten
  den Serverstart komplett ohne vorkonfiguriertes Passwort. Das war ein
  Henne-Ei-Problem (man kam nie bis zu einer Oberfläche, die das Passwort
  hätte setzen können) und wurde durch den Setup-Bildschirm ersetzt: der
  Server startet immer, verweigert aber jede andere Aktion, bis ein
  Passwort gesetzt ist.
- **Rate-Limiting:** Login ist auf 10 Versuche pro 15 Minuten pro IP begrenzt
  (jeder im selben WLAN kann die Login-Route erreichen, nicht nur du selbst).
- **Security-Header** via `helmet` (Content-Security-Policy, X-Frame-Options,
  kein `X-Powered-By` mehr).
- **Zentrale Fehlerbehandlung:** Ein einzelner Fehler in einer Route bringt
  nicht den ganzen Server zum Absturz; Antworten geben nie Stacktraces preis.
- Kein CORS-Middleware, da Frontend und Backend immer same-origin laufen –
  eine unnötige offene Angriffsfläche weniger.
- Klartext-Speicherung von Kalender-/Mail-Zugangsdaten: siehe eigener
  Abschnitt oben unter „Was wird lokal gespeichert?".

## Bekannte Einschränkungen

- **Barrierefreiheit (Formular-Labels):** `<label>` und Eingabefeld sind
  inzwischen über die neue `FormField`-Komponente (`useId()`-basiert) an
   62 von 68 Stellen über 10 Seiten automatisch verknüpft (Login-/
  Setup-Bildschirm war bereits vorher manuell korrekt). Wenige Ausnahmen
  bleiben unverknüpft, weil eine automatische Umstellung dort unsicher
  gewesen wäre (native Datei-Auswahl, Mehrfach-Feld-Gruppen wie die
  Kalendername-je-Bereich-Liste) – siehe `SECURITY_HARDENING.md` für die
  vollständige Liste.
- Kein Verschlüsselungs-Layer für die in der Datenbank gespeicherten
  Zugangsdaten (siehe oben).
- Kalender: nur Ansicht, kein Anlegen/Bearbeiten von Terminen in der App
  (siehe Abschnitt „Kalender-Sync einrichten" oben); keine
  Konflikterkennung, kein ICS-Import/-Export.
- Aufgaben: Kanban-Board gruppiert nur nach Priorität (drei feste
  Spalten), keine frei definierbaren Spalten, kein Drag-and-drop
  zwischen Spalten (Status/Priorität ändert sich weiterhin über die
  Checkbox bzw. „Bearbeiten"); erledigte Aufgaben werden im Kanban
  ausgeblendet. Keine Unteraufgaben/Abhängigkeiten.
- Globale Suche: kein Deep-Link zu einzelnen Einträgen (nur zur Modul-
  Seite), keine Fuzzy-Suche, reine Textsuche pro Feld.
- Notizen: kein Markdown/Rich-Text, reiner Text.
- Gesundheit: rein manuelle Erfassung, keine Anbindung an Apple Health/
  Wearables, keine Zuordnung zu Lebensbereichen.
- Ziele: Meilensteine sind eine eigene Checkliste, keine Verknüpfung mit
  echten Aufgaben-Datensätzen.
- Dokumente: keine Inhalts-Vorschau/kein Viewer in der App, kein
  Volltext-Suche innerhalb der Dateien (nur über Titel/Dateiname), keine
  Ordnerstruktur/Unterordner.
- Verträge & Abos: Kündigungsfrist-Warnung ist rein informativ innerhalb
  der App beim Öffnen der Seite, keine Push-/E-Mail-Erinnerung.
- Google-/Gmail-OAuth, native Apple-Calendar-Integration und Outlook/
  Microsoft-365-Postfächer sind vorbereitet, aber noch nicht angebunden
  (siehe „Welche externen Verbindungen funktionieren wirklich?").

## Nächste Etappen

Alle Punkte der ursprünglich vereinbarten Reihenfolge sind umgesetzt.
Mögliche weitere Ausbaustufen, die während der Arbeit an den bisherigen
Etappen als bewusste Einschränkung offengelegt wurden (siehe „Bekannte
Einschränkungen" oben) und bei Bedarf eigene künftige Etappen wären:

- Termine im Kalender direkt in der App anlegen/bearbeiten (Schreib-
  zugriff auf CalDAV), ICS-Import/-Export, Konflikterkennung
- Unteraufgaben/Abhängigkeiten, frei definierbare Kanban-Spalten
- Verschlüsselung der in der Datenbank gespeicherten Zugangsdaten
- Verbleibende `htmlFor`/`id`-Ausnahmen (Datei-Upload, Mehrfach-Feld-
  Gruppen) und Formular-„ungespeicherte Änderungen"-Warnung beim
  Seitenverlassen
- Google Calendar/Gmail-OAuth, native Apple-Calendar-Integration,
  Outlook/Microsoft-365-Postfächer
- Verschlüsseltes Backup (aktuell Klartext-JSON, siehe „Backup &
  Wiederherstellung")
