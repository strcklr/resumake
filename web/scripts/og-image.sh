#!/usr/bin/env bash
# Regenerate public/og.png (the 1200×630 link-preview image) and public/apple-touch-icon.png.
# Needs: resumake installed (pip install -e ..), pdftoppm (poppler-utils), and Playwright with Chromium.
# Run from web/: scripts/og-image.sh
set -euo pipefail
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for theme in classic modern executive; do
  resumake build ../resumes/default.yml -t "$theme" -f pdf -o "$work/$theme" > /dev/null
  pdftoppm -r 110 -f 1 -l 1 -png "$work/$theme/default.pdf" "$work/$theme"
done

NODE_PATH="${NODE_PATH:-$(npm root -g)}" node scripts/og-image.mjs "$work" public
