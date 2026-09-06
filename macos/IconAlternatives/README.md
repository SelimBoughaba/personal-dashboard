# App-Icon-Alternativen

1. `01-dashboard-grid.png` – Dashboard-Kacheln; direkt und funktional
2. `02-orbit.png` – synchronisierte Lebensbereiche; technisch und systemisch
3. `03-portal.png` – ein ruhiger Zugangspunkt; eigenständig und hochwertig (**aktiver Standard**)
4. `04-progress-path.png` – Fortschritt und Ziele; räumlich und motivierend

Alle Masterdateien sind quadratische PNGs mit Alphakanal. Einen Entwurf für
den nächsten App-Build auswählen:

```bash
ICON_SOURCE="$PWD/macos/IconAlternatives/03-portal.png" ./macos/build-app.sh
```

Das Build-Skript erzeugt daraus automatisch alle benötigten macOS-Größen und
die Datei `AppIcon.icns`.
