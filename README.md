# Persönliches Dashboard

Lokales Dashboard für Aufgaben, Kalender, Mail und Rechnungen – läuft nur im
eigenen Heimnetz, kein öffentliches Hosting.

**Stand:** Etappe 5 (letzte Etappe) – Setup, Passwort-Login, Aufgaben-Modul,
Design-System, Kalender-Sync (CalDAV/iCloud), Mail-Modul (IONOS via IMAP),
Rechnungs-Automatisierung (PDF-Erkennung), PWA (installierbar, offline-fähig).
Alle Module aus der ursprünglichen Anleitung sind umgesetzt.

## Projektstruktur

- `backend/` – Express-API + SQLite (`better-sqlite3`)
- `frontend/` – React (Vite) + Tailwind CSS

## Lokal starten

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
npm run hash-password -- "DeinPasswort"
# den ausgegebenen APP_PASSWORD_HASH in backend/.env eintragen
# außerdem JWT_SECRET in .env auf einen langen zufälligen Wert setzen
npm run dev
```

Der Server läuft dann auf `http://localhost:4000` (bzw. `http://<Mac-IP>:4000`
für Zugriff vom iPhone im selben WLAN).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Öffnet unter `http://localhost:5173`. Im Dev-Modus leitet Vite `/api`-Anfragen
an den Backend-Server auf Port 4000 weiter.

### 3. Zugriff vom iPhone

Mac-IP im selben WLAN herausfinden (Systemeinstellungen → WLAN → Details),
dann auf dem iPhone `http://<Mac-IP>:5173` (Dev) bzw. später die produktive
Adresse öffnen. Für den Dauerbetrieb: `npm run build` im Frontend, danach
liefert der Backend-Server (`npm start` in `backend/`) das gebaute Frontend
automatisch mit aus – dann reicht eine einzige Adresse `http://<Mac-IP>:4000`.

## Kalender-Sync einrichten (iCloud)

1. App-spezifisches Passwort erzeugen: auf [appleid.apple.com](https://appleid.apple.com)
   anmelden → „Anmelden & Sicherheit" → „App-spezifische Passwörter" → neues
   Passwort erstellen (Name z. B. „Dashboard"). **Nicht** das normale
   Apple-ID-Passwort verwenden, das funktioniert nicht.
2. In `backend/.env` eintragen:
   ```
   ICLOUD_USERNAME=deine-apple-id@icloud.com
   ICLOUD_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   ```
3. Optional: Kalender bestimmten Bereichen zuordnen. Wenn du in Apple Calendar
   z. B. eigene Kalender „Corelegal", „Evermont", „Nachhilfe" angelegt hast,
   trage in `backend/.env` ein:
   ```
   CALENDAR_AREA_MAP={"Corelegal":"corelegal","Evermont":"evermont","Nachhilfe":"nachhilfe"}
   ```
   Der Name muss exakt dem Kalendernamen in Apple Calendar entsprechen.
   Nicht gelistete Kalender werden als „Allgemein" angezeigt.
4. Backend neu starten. Termine (inkl. wiederkehrender Termine) erscheinen
   dann im Tab „Kalender" in Tages- und Wochenansicht, farblich nach Bereich
   filterbar.

## Mail-Modul einrichten (IONOS)

1. IMAP muss im IONOS-Postfach aktiviert sein (Webmail → Einstellungen →
   POP3/IMAP). Host/Port findest du in den IONOS-Kontoeinstellungen bzw.
   in der bisherigen Mail-App-Konfiguration deines iPhones (meist
   `imap.ionos.de`, Port `993`).
2. In `backend/.env` eintragen:
   ```
   IONOS_IMAP_HOST=imap.ionos.de
   IONOS_IMAP_PORT=993
   IONOS_IMAP_USER=deine-adresse@deine-domain.de
   IONOS_IMAP_PASSWORD=dein-postfach-passwort
   ```
3. Optional: Absender bestimmten Bereichen zuordnen, z. B.
   ```
   MAIL_AREA_RULES={"kanzlei-mustermann.de":"corelegal","evermont.de":"evermont"}
   ```
   Geprüft wird, ob der angegebene Text (Domain oder vollständige Adresse)
   in der Absenderadresse vorkommt. Nicht zugeordnete Mails laufen unter
   „Allgemein".
4. Backend neu starten. Im Tab „Mail" erscheinen ungelesene und markierte
   Mails aus dem Postfach, bereichsfilterbar.

**Hinweis zu Outlook/Microsoft 365:** Microsoft hat klassisches
Passwort-IMAP 2022 abgeschaltet. Das Outlook-Postfach ist deshalb aktuell
noch nicht angebunden – dafür wäre eine OAuth2-Anbindung (Azure-App-
Registrierung) nötig, die wir bei Bedarf als eigene Etappe ergänzen.

## Rechnungs-Automatisierung

Voraussetzung: Mail-Modul (IONOS) ist eingerichtet (siehe oben) – die
Rechnungserkennung nutzt dieselbe Postfach-Verbindung.

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
4. Nutzt dieselbe `MAIL_AREA_RULES`-Zuordnung wie das Mail-Modul für die
   automatische Bereichs-Zuordnung.

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

- `.env`-Dateien enthalten Zugangsdaten und werden nie committet.
- Passwort wird nur als bcrypt-Hash gespeichert.
- Zugriff nur mit gültigem JWT (30 Tage gültig, dann erneut anmelden).
