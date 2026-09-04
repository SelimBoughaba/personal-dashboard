# Persönliches Dashboard

Lokales Dashboard für Aufgaben, Kalender, Finanzen und mehr – läuft nur im
eigenen Heimnetz, kein öffentliches Hosting, keine Pflicht-Cloud-Dienste.
Design orientiert sich an der Evermont-Markenidentität (Waldgrün, Ivory,
Lime-Akzente, Manrope).

**Stand:** Etappe 13 – Globale Suche/Kommandopalette. Zusätzlich zu allen
Modulen aus den Etappen 7–12 (lokale Grundlage, Dokumente, Verträge &
Abos, Ziele, Notizen, Gesundheit) gibt es jetzt eine Kommandopalette
(Tastenkürzel Strg/Cmd+K oder Such-Button in der Sidebar), die Aufgaben,
Rechnungen, Dokumente, Verträge, Ziele und Notizen gleichzeitig durchsucht
und zusätzlich als Schnellzugriff auf alle Seiten dient.

Damit sind alle bisherigen Hauptnavigationspunkte umgesetzt. Noch als
„bald" markiert: erweiterte Kalender-/Aufgabenansichten.

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
- **Löschen:** entfernt sowohl den Datenbank-Eintrag als auch die Datei
  auf der Platte unwiderruflich.
- Es gibt aktuell keine Vorschau/kein Rendering von Dateiinhalten
  innerhalb der App (z. B. kein eingebetteter PDF-Viewer) – Dokumente
  werden zum Ansehen heruntergeladen und lokal geöffnet.

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
  (Titel/Anbieter), Ziele (Titel/Beschreibung) und Notizen (Titel/Inhalt)
  gleichzeitig, gruppiert nach Kategorie (max. 5 Treffer pro Kategorie).
- Ein Klick auf einen Treffer navigiert zur jeweiligen Modul-Seite (z. B.
  „Aufgaben" oder „Notizen") – **kein Deep-Link zu einem einzelnen,
  hervorgehobenen Eintrag** innerhalb der Seite, das wäre ein größerer
  Umbau der einzelnen Module und ist als spätere Verbesserung denkbar.
- Kein Fuzzy-Matching/keine Tippfehler-Toleranz, reine `LIKE`-Textsuche.

## Kalender-Sync einrichten (iCloud)

1. App-spezifisches Passwort erzeugen: auf [appleid.apple.com](https://appleid.apple.com)
   anmelden → „Anmelden & Sicherheit" → „App-spezifische Passwörter" → neues
   Passwort erstellen (Name z. B. „Dashboard"). **Nicht** das normale
   Apple-ID-Passwort verwenden, das funktioniert nicht.
2. Unter Einstellungen → Kalender (oder im Einrichtungsassistenten)
   Apple-ID und das App-Passwort eintragen und mit „Verbindung testen"
   prüfen.
3. Termine (inkl. wiederkehrender Termine) erscheinen im Tab „Kalender" in
   Tages- und Wochenansicht, farblich nach Lebensbereich filterbar.

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

- **Barrierefreiheit (Formular-Labels):** Auf dem Login-/Setup-Bildschirm
  sind `<label>` und `<input>` korrekt über `htmlFor`/`id` verknüpft
  (Screenreader lesen das Feld korrekt vor, Klick aufs Label fokussiert das
  Feld). In den übrigen Formularen der App (Aufgaben, Rechnungen, alle
  Einstellungs-Unterseiten) fehlt diese Verknüpfung noch teilweise – die
  Felder sind visuell und per Tab-Reihenfolge nutzbar, aber nicht überall
  optimal für Screenreader beschriftet. Geplante schrittweise Behebung.
- Kein Verschlüsselungs-Layer für die in der Datenbank gespeicherten
  Zugangsdaten (siehe oben).
- Erweiterte Kalender-/Aufgabenansichten sind noch nicht umgesetzt (klar
  als „bald" markiert in der Navigation).
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

- Erweiterte Kalender-/Aufgabenansichten (Monats-/Agenda-Ansicht, Kanban,
  Unteraufgaben, wiederkehrende Termine im UI erstellbar)
