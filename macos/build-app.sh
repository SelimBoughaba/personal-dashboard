#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
BUILD_DIR="$SCRIPT_DIR/build"
APP_NAME="Personal Dashboard"
APP_DIR="$BUILD_DIR/$APP_NAME.app"
CONTENTS_DIR="$APP_DIR/Contents"
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

if [[ ! -x "$NODE_BINARY" ]]; then
  print -u2 "Node.js wurde nicht gefunden. Installiere Node.js und starte den Build erneut."
  exit 1
fi

print "1/6 Abhängigkeiten installieren"
npm ci --prefix "$PROJECT_DIR/frontend"
npm ci --omit=dev --prefix "$PROJECT_DIR/backend"

print "2/6 Frontend bauen"
npm run build --prefix "$PROJECT_DIR/frontend"

print "3/6 App-Bundle vorbereiten"
rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$SERVER_DIR/backend" "$SERVER_DIR/frontend" "$RESOURCES_DIR"
cp "$SCRIPT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$NODE_BINARY" "$RESOURCES_DIR/node"
chmod 755 "$RESOURCES_DIR/node"
ditto "$PROJECT_DIR/backend/src" "$SERVER_DIR/backend/src"
ditto "$PROJECT_DIR/backend/node_modules" "$SERVER_DIR/backend/node_modules"
cp "$PROJECT_DIR/backend/package.json" "$SERVER_DIR/backend/package.json"
ditto "$PROJECT_DIR/frontend/dist" "$SERVER_DIR/frontend/dist"

print "4/6 Native macOS-Hülle kompilieren"
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

print "5/6 App-Icon erstellen"
ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"
rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"
for spec in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" "64 icon_32x32@2x.png" "128 icon_128x128.png" "256 icon_128x128@2x.png" "256 icon_256x256.png" "512 icon_256x256@2x.png" "512 icon_512x512.png" "1024 icon_512x512@2x.png"; do
  size="${spec%% *}"
  name="${spec#* }"
  sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET_DIR/$name" >/dev/null
done
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/AppIcon.icns"
rm -rf "$ICONSET_DIR"

print "6/6 App signieren"
codesign --force --deep --sign - "$APP_DIR"
codesign --verify --deep --strict "$APP_DIR"

print ""
print "Fertig: $APP_DIR"
print "Starten mit: open '$APP_DIR'"
