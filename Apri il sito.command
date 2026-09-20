#!/bin/sh
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$ROOT/outputs/mio-agente-ai/.venv/bin/python" -X utf8 "$ROOT/linea.py" start
