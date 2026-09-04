#!/bin/bash
# Beendet den im Hintergrund laufenden Dashboard-Server.
set -uo pipefail

PID="$(lsof -ti tcp:4000 2>/dev/null || true)"

if [ -z "$PID" ]; then
  echo "Dashboard läuft aktuell nicht (Port 4000 ist frei)."
else
  echo "Beende Dashboard-Server (PID $PID)..."
  kill "$PID" 2>/dev/null || true
  sleep 1
  if lsof -ti tcp:4000 >/dev/null 2>&1; then
    echo "Server reagiert nicht, erzwinge Beenden..."
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "Dashboard wurde gestoppt."
fi

read -r -p "Enter zum Schließen..." _
