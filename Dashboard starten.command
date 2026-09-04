#!/bin/bash
# Startet das Dashboard: holt die neueste Version, installiert/baut bei
# Bedarf und öffnet die App automatisch im Browser. Einfach doppelklicken.
set -uo pipefail
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "=== Dashboard wird gestartet ==="
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js wurde nicht gefunden. Bitte zuerst Node.js installieren (https://nodejs.org)."
  read -r -p "Enter zum Schließen..." _
  exit 1
fi

# Schon ein laufender Server? Dann nur das Fenster im Browser öffnen.
if curl -s -o /dev/null -m 2 "http://localhost:4000/api/health"; then
  echo "Dashboard läuft bereits – öffne den Browser."
  open "http://localhost:4000"
  exit 0
fi

echo "--- Hole neueste Version ---"
if ! git pull; then
  echo
  echo "Achtung: 'git pull' ist fehlgeschlagen (siehe Meldung oben, z. B. eigene"
  echo "nicht gespeicherte Änderungen im Projektordner). Es wird trotzdem mit dem"
  echo "aktuell vorhandenen Stand fortgefahren."
fi
echo

echo "--- Backend: Abhängigkeiten prüfen ---"
cd "$ROOT_DIR/backend"
npm install --no-fund --no-audit
echo

echo "--- Frontend: bauen ---"
cd "$ROOT_DIR/frontend"
npm install --no-fund --no-audit
npm run build
echo

echo "--- Server starten ---"
cd "$ROOT_DIR/backend"
# Läuft im Hintergrund weiter, auch wenn dieses Fenster geschlossen wird.
nohup npm start > "$ROOT_DIR/dashboard-server.log" 2>&1 &
disown

echo "Warte, bis der Server bereit ist..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -m 1 "http://localhost:4000/api/health"; then
    echo "Server läuft."
    open "http://localhost:4000"
    echo
    echo "Fertig. Dieses Fenster kann geschlossen werden, der Server läuft im"
    echo "Hintergrund weiter (zum Beenden: 'Dashboard stoppen.command' benutzen)."
    read -r -p "Enter zum Schließen..." _
    exit 0
  fi
  sleep 1
done

echo "Der Server ist nach 30 Sekunden nicht erreichbar. Log-Datei prüfen:"
echo "  dashboard-server.log (im Projektordner)"
read -r -p "Enter zum Schließen..." _
exit 1
