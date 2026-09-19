#!/bin/zsh
cd -- "${0:A:h}" || exit 1
../mio-agente-ai/.venv/bin/python esporta_archivio.py
open private-data
read '?Premi Invio per chiudere.'
