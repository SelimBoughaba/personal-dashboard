#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
BUILD_DIR="$SCRIPT_DIR/build"
APP_NAME="Personal Dashboard"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
# Neues Bundle wird komplett in einem separaten Staging-Verzeichnis gebaut
# und erst nach vollständigem, geprüftem Erfolg (inkl. codesign --verify)
# an die endgültige Stelle verschoben. Schlägt irgendein Schritt fehl
# (Kompilierfehler, fehlendes Icon, Signierproblem), bleibt die zuletzt
# funktionierende App in $APP_DIR unangetastet stehen, statt durch ein
# halbfertiges Bundle ersetzt (oder durch das vorherige rm -rf einfach
# gelöscht) zu werden.
STAGING_DIR="$BUILD_DIR/.staging-$$"
APP_DIR_STAGED="$STAGING_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR_STAGED/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
SERVER_DIR="$RESOURCES_DIR/server"
NODE_BINARY="${NODE_BINARY:-$(command -v node)}"
ICON_SOURCE="${ICON_SOURCE:-$PROJECT_DIR/macos/IconAlternatives/03-portal.png}"
DEFAULT_SDK="$(xcrun --sdk macosx --show-sdk-path)"
if [[ -d "/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk" ]]; then
  DEFAULT_SDK="/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk"
fi
SDK_PATH="${SDK_PATH:-$DEFAULT_SDK}"
MODULE_CACHE_DIR="$BUILD_DIR/ModuleCache"
# Muss zur in backend/package.json#engines deklarierten Mindestversion
# passen - ein Bundle mit einer anderen Node-Laufzeit als der getesteten
# kann sich subtil anders verhalten (siehe better-sqlite3, das gegen eine
# bestimmte Node-ABI kompiliert wird).
REQUIRED_NODE_MAJOR="${REQUIRED_NODE_MAJOR:-20}"

cleanup_staging() { rm -rf "$STAGING_DIR"; }
trap cleanup_staging EXIT

if [[ ! -x "$NODE_BINARY" ]]; then
  print -u2 "Node.js wurde nicht gefunden. Installiere Node.js und starte den Build erneut."
  exit 1
fi

NODE_VERSION="$("$NODE_BINARY" --version)"
NODE_MAJOR="${${NODE_VERSION#v}%%.*}"
if [[ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]]; then
  print -u2 "Node $NODE_VERSION ist älter als die unterstützte Mindestversion v$REQUIRED_NODE_MAJOR. Aktuelle Node-LTS installieren oder NODE_BINARY auf eine passende Version zeigen lassen."
  exit 1
fi

GIT_COMMIT="$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unbekannt")"
GIT_DIRTY="sauber"
if [[ -n "$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null)" ]]; then
  GIT_DIRTY="mit-lokalen-aenderungen"
fi
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

print "1/7 Abhängigkeiten installieren"
npm ci --prefix "$PROJECT_DIR/frontend"
npm ci --omit=dev --prefix "$PROJECT_DIR/backend"

print "2/7 Frontend bauen"
npm run build --prefix "$PROJECT_DIR/frontend"

print "3/7 App-Bundle im Staging-Verzeichnis vorbereiten"
mkdir -p "$MACOS_DIR" "$SERVER_DIR/backend" "$SERVER_DIR/frontend" "$RESOURCES_DIR"
cp "$SCRIPT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
# Build-Herkunft sichtbar machen (Punkt 52: "Build-ID, Commit und relevante
# lokale Änderungen sichtbar machen") - eigene Zusatzschlüssel statt
# CFBundleVersion zu überladen, das macOS für Update-Vergleiche nutzt.
/usr/libexec/PlistBuddy -c "Add :DashboardBuildCommit string $GIT_COMMIT" "$CONTENTS_DIR/Info.plist"
/usr/libexec/PlistBuddy -c "Add :DashboardBuildDirty string $GIT_DIRTY" "$CONTENTS_DIR/Info.plist"
/usr/libexec/PlistBuddy -c "Add :DashboardBuildTimestamp string $BUILD_TIMESTAMP" "$CONTENTS_DIR/Info.plist"
/usr/libexec/PlistBuddy -c "Add :DashboardBuildNodeVersion string $NODE_VERSION" "$CONTENTS_DIR/Info.plist"
cp "$NODE_BINARY" "$RESOURCES_DIR/node"
chmod 755 "$RESOURCES_DIR/node"
ditto "$PROJECT_DIR/backend/src" "$SERVER_DIR/backend/src"
ditto "$PROJECT_DIR/backend/node_modules" "$SERVER_DIR/backend/node_modules"
cp "$PROJECT_DIR/backend/package.json" "$SERVER_DIR/backend/package.json"
ditto "$PROJECT_DIR/frontend/dist" "$SERVER_DIR/frontend/dist"

print "4/7 Native macOS-Hülle kompilieren"
ARCH="$(uname -m)"
mkdir -p "$MODULE_CACHE_DIR"
xcrun swiftc \
  -O \
  -parse-as-library \
  -target "$ARCH-apple-macos13.0" \
  -sdk "$SDK_PATH" \
  -module-cache-path "$MODULE_CACHE_DIR" \
  "$SCRIPT_DIR/Sources/PersonalDashboardApp.swift" \
  -framework AppKit \
  -framework WebKit \
  -o "$MACOS_DIR/PersonalDashboard"

print "5/7 App-Icon erstellen"
ICONSET_DIR="$STAGING_DIR/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"
for spec in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" "64 icon_32x32@2x.png" "128 icon_128x128.png" "256 icon_128x128@2x.png" "256 icon_256x256.png" "512 icon_256x256@2x.png" "512 icon_512x512.png" "1024 icon_512x512@2x.png"; do
  size="${spec%% *}"
  name="${spec#* }"
  sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET_DIR/$name" >/dev/null
done
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"

print "6/7 App signieren und vollständig prüfen"
# Ad-hoc-Signatur (-sign -): für lokale Einzelnutzung ausreichend, aber
# KEINE Developer-ID/Notarisierung - das eine für das andere auszugeben
# wäre die falsche Behauptung, vor der Punkt 52 warnt. Für eine externe
# Verteilung (nicht Ziel dieses Projekts) müsste hier stattdessen mit
# einer echten Developer-ID signiert und anschließend notarisiert werden.
codesign --force --deep --sign - "$APP_DIR_STAGED"
codesign --verify --deep --strict "$APP_DIR_STAGED"

print "7/7 Geprüftes Bundle an die endgültige Stelle verschieben"
mkdir -p "$BUILD_DIR"
if [[ -d "$APP_DIR" ]]; then
  rm -rf "$APP_DIR.previous"
  mv "$APP_DIR" "$APP_DIR.previous"
fi
mv "$APP_DIR_STAGED" "$APP_DIR"

print ""
print "Fertig: $APP_DIR"
print "Build: commit $GIT_COMMIT ($GIT_DIRTY), Node $NODE_VERSION, $BUILD_TIMESTAMP"
if [[ -d "$APP_DIR.previous" ]]; then
  print "Vorherige Version gesichert unter: $APP_DIR.previous"
fi
print "Starten mit: open '$APP_DIR'"
