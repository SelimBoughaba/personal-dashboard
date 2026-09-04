# Persönliches Dashboard

Lokales Dashboard für Aufgaben, Kalender, Mail und Rechnungen – läuft nur im
eigenen Heimnetz, kein öffentliches Hosting.

**Stand:** Etappe 1 – Setup, Passwort-Login, Aufgaben-Modul, Design-System.
Kalender, Mail und Rechnungen folgen in weiteren Etappen.

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

## Sicherheit

- `.env`-Dateien enthalten Zugangsdaten und werden nie committet.
- Passwort wird nur als bcrypt-Hash gespeichert.
- Zugriff nur mit gültigem JWT (30 Tage gültig, dann erneut anmelden).

## Nächste Etappen

2. Kalender-Sync (CalDAV/iCloud) – benötigt App-spezifisches Passwort
3. Mail-Modul (IONOS via IMAP; Outlook folgt später separat wegen OAuth2)
4. Rechnungs-Automatisierung (PDF-Erkennung aus Mail-Anhängen)
5. PWA-Feinschliff (Installierbarkeit auf iPhone, Offline-Fähigkeit)
