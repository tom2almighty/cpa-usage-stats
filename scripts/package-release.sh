#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ID="cpa-usage-stats"
VERSION="${1:-1.0.0}"
VERSION="${VERSION#v}" # remove leading 'v' if present

GOOS="$(go env GOOS)"
GOARCH="$(go env GOARCH)"

case "${GOOS}" in
    darwin) EXT="dylib" ;;
    windows) EXT="dll" ;;
    *) EXT="so" ;;
esac

DIST_DIR="release-dist"
mkdir -p "${DIST_DIR}"

echo "==> Step 1: Building Web frontend..."
cd web
bun install
bun run build
cd ..

LIB_NAME="${PLUGIN_ID}.${EXT}"
ZIP_NAME="${PLUGIN_ID}_${VERSION}_${GOOS}_${GOARCH}.zip"

echo "==> Step 2: Compiling shared library: ${LIB_NAME}..."
CGO_ENABLED=1 go build -buildmode=c-shared -ldflags="-s -w -X cpa-usage-stats/internal/plugin.Version=${VERSION}" -o "${LIB_NAME}" .
rm -f "${PLUGIN_ID}.h"

echo "==> Step 3: Packaging to ${DIST_DIR}/${ZIP_NAME} with Go packager..."
rm -f "${DIST_DIR}/${ZIP_NAME}"
rm -f "${DIST_DIR}/checksums.txt"

go run ./cmd/packager -src "${LIB_NAME}" -out "${DIST_DIR}/${ZIP_NAME}" -checksum "${DIST_DIR}/checksums.txt"
rm -f "${LIB_NAME}"

echo "==> Step 4: Done! Release package ready in ${DIST_DIR}/:"
ls -lh "${DIST_DIR}/"
cat "${DIST_DIR}/checksums.txt"
