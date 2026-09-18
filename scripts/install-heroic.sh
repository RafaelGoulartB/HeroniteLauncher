#!/usr/bin/env bash
set -euo pipefail

# Install this fork next to the official AUR Heroic, as "Heronite".
# Official app stays at /opt/Heroic. Re-run this script to update the fork.

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(cd "$SRC/.." && pwd)"
ICON_SRC="$ROOT/assets/heroic-local.png"
PREFIX="${HERONITE_INSTALL_PREFIX:-${HEROIC_INSTALL_PREFIX:-$HOME/.local/opt/Heronite}}"
OLD_PREFIX="$HOME/.local/opt/HeroicLocal"
BIN_DIR="$HOME/.local/bin"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_BASE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"

if pgrep -f "$PREFIX/" >/dev/null 2>&1 || pgrep -f "$OLD_PREFIX/" >/dev/null 2>&1; then
  echo "Close Heronite before installing (it is running)." >&2
  exit 1
fi

cd "$SRC"

if [[ ! -d node_modules ]]; then
  pnpm install
fi

if [[ ! -d build/bin ]]; then
  pnpm download-helper-binaries
fi

pnpm exec electron-vite build
pnpm exec electron-builder --linux dir --publish never

UNPACKED=""
for candidate in dist/linux-unpacked dist/linux-x64-unpacked; do
  if [[ -d "$candidate" ]]; then
    UNPACKED="$candidate"
    break
  fi
done

if [[ -z "$UNPACKED" ]]; then
  echo "electron-builder did not produce linux-unpacked in $SRC/dist" >&2
  exit 1
fi

EXE=""
for candidate in "$UNPACKED/heroic" "$UNPACKED/Heroic"; do
  if [[ -x "$candidate" ]]; then
    EXE="$(basename "$candidate")"
    break
  fi
done

if [[ -z "$EXE" ]]; then
  echo "Could not find the Heroic binary in $UNPACKED" >&2
  exit 1
fi

mkdir -p "$(dirname "$PREFIX")" "$BIN_DIR" "$APP_DIR"
rm -rf "$PREFIX"
if [[ "$OLD_PREFIX" != "$PREFIX" ]]; then
  rm -rf "$OLD_PREFIX"
fi
cp -a "$UNPACKED" "$PREFIX"
ln -sfn "$PREFIX/$EXE" "$BIN_DIR/heronite"
rm -f "$BIN_DIR/heroic-local"

# Do not override the official Heroic command or desktop entry.
if [[ -L "$BIN_DIR/heroic" ]]; then
  target="$(readlink -f "$BIN_DIR/heroic" || true)"
  if [[ "$target" == "$PREFIX/"* ]] || [[ "$target" == "$HOME/.local/opt/Heroic/"* ]] || [[ "$target" == "$OLD_PREFIX/"* ]]; then
    rm -f "$BIN_DIR/heroic"
  fi
fi
rm -f "$APP_DIR/heroic.desktop" "$APP_DIR/heroic-local.desktop"

if [[ -f "$ICON_SRC" ]]; then
  for size in 128 256 512 1024; do
    dir="$ICON_BASE/${size}x${size}/apps"
    mkdir -p "$dir"
    magick "$ICON_SRC" -resize "${size}x${size}" "$dir/heronite.png"
    rm -f "$dir/heroic-local.png"
  done
fi

cat > "$APP_DIR/heronite.desktop" <<EOF
[Desktop Entry]
Name=Heronite
Exec=$PREFIX/$EXE --class=Heronite %U
Terminal=false
Type=Application
Icon=heronite
StartupWMClass=Heronite
Comment=Personal Heroic fork with Playnite Collection
Categories=Game;
EOF

if command -v update-desktop-database >/dev/null; then
  update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null; then
  gtk-update-icon-cache -f "$ICON_BASE" >/dev/null 2>&1 || true
fi

echo
echo "Heronite installed to $PREFIX"
echo "Menu name: Heronite (orange shield)"
echo "Command: heronite"
echo
echo "Official Heroic is unchanged (/opt/Heroic, menu 'Heroic Games Launcher')."
echo "Do not open both at once: they share ~/.config/heroic."
echo "To update the fork after code changes, run this script again."
