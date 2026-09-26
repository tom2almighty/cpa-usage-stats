#!/usr/bin/env bash
set -euo pipefail

PLUGIN_NAME="cpa-usage-stats"
OS_NAME="$(uname -s)"

case "${OS_NAME}" in
    Darwin*) EXT="dylib" ;;
    MINGW*|MSYS*|CYGWIN*) EXT="dll" ;;
    *) EXT="so" ;;
esac

echo "==> Step 1: Building Web Frontend with Bun & Vite..."
cd web
bun run build
cd ..

echo "==> Step 2: Compiling CGO Shared Library (${PLUGIN_NAME}.${EXT})..."
CGO_ENABLED=1 go build -buildmode=c-shared -ldflags="-s -w" -o "${PLUGIN_NAME}.${EXT}" .
rm -f "${PLUGIN_NAME}.h"

echo "==> Build successful: ${PLUGIN_NAME}.${EXT} ($(du -h "${PLUGIN_NAME}.${EXT}" | cut -f1))"
