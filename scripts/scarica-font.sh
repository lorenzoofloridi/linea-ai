#!/bin/sh
# Scarica i caratteri del sito (Plus Jakarta Sans e Instrument Serif, licenza
# SIL Open Font License) e li copia in outputs/linea-ai-site/dist/fonts.
# Così il sito li serve da solo, senza chiamare Google Fonts o altri server.
# Da lanciare una sola volta dalla cartella del progetto:  sh scripts/scarica-font.sh
set -e
cd "$(dirname "$0")/.."
DEST=outputs/linea-ai-site/dist/fonts
TMP=$(mktemp -d)
mkdir -p "$DEST"
(cd "$TMP" && npm pack --silent @fontsource-variable/plus-jakarta-sans@5 @fontsource/instrument-serif@5 >/dev/null)
for f in "$TMP"/*.tgz; do tar -xzf "$f" -C "$TMP" && mv "$TMP/package" "$TMP/$(basename "$f" .tgz)"; done
cp "$TMP"/fontsource-variable-plus-jakarta-sans-*/files/plus-jakarta-sans-latin-wght-normal.woff2 "$DEST/"
cp "$TMP"/fontsource-variable-plus-jakarta-sans-*/files/plus-jakarta-sans-latin-ext-wght-normal.woff2 "$DEST/"
cp "$TMP"/fontsource-instrument-serif-*/files/instrument-serif-latin-400-italic.woff2 "$DEST/"
cp "$TMP"/fontsource-variable-plus-jakarta-sans-*/LICENSE "$DEST/LICENSE-plus-jakarta-sans.txt" 2>/dev/null || true
cp "$TMP"/fontsource-instrument-serif-*/LICENSE "$DEST/LICENSE-instrument-serif.txt" 2>/dev/null || true
rm -rf "$TMP"
ls -l "$DEST"
echo "Caratteri pronti in $DEST"
