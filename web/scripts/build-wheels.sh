#!/usr/bin/env bash
# Rebuild the pure-Python wheels the live preview loads into Pyodide (web/public/py/).
#
# The preview needs only Jinja2 and MarkupSafe. Pyodide's own builds of them live on its CDN,
# which the site doesn't use (everything is self-hosted). Jinja2 ships a pure wheel on PyPI;
# MarkupSafe ships only compiled wheels, so it's built from source with its C speedups turned
# off (MarkupSafe falls back to its plain-Python escape function).
#
# Keep the versions in step with what resumake supports (see pyproject.toml).
set -euo pipefail
JINJA2=3.1.6
MARKUPSAFE=3.0.3

out="$(cd "$(dirname "$0")/.." && pwd)/public/py"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pip download -q --no-deps --only-binary=:all: "jinja2==$JINJA2" -d "$work"
pip download -q --no-deps --no-binary=:all: "markupsafe==$MARKUPSAFE" -d "$work"
tar xzf "$work/markupsafe-$MARKUPSAFE.tar.gz" -C "$work"
# CC=false makes the C extension fail to compile; MarkupSafe's setup.py then builds a pure wheel.
(cd "$work/markupsafe-$MARKUPSAFE" && CC=false pip wheel -q --no-deps . -w "$work")

rm -f "$out"/*.whl
mkdir -p "$out"
cp "$work/jinja2-$JINJA2-py3-none-any.whl" "$work/markupsafe-$MARKUPSAFE-py3-none-any.whl" "$out/"
ls -l "$out"
