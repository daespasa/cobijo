#!/bin/sh
# Instala el lanzador «Cobijo» en el menú de aplicaciones (Linux, freedesktop).
# Rellena la plantilla con la ruta de este repo y la del Node actual (útil con nvm).
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
NODE_BIN=$(dirname "$(command -v node)")
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/applications/cobijo.desktop"
mkdir -p "$(dirname "$DEST")"
sed -e "s|@ROOT@|$ROOT|g" -e "s|@NODE_BIN@|$NODE_BIN|g" "$ROOT/scripts/cobijo.desktop.in" > "$DEST"
command -v desktop-file-validate >/dev/null && desktop-file-validate "$DEST"
echo "Lanzador instalado en $DEST"
