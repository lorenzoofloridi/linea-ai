#!/bin/zsh
cd -- "${0:A:h}" || exit 1
./.venv/bin/python -m scripts.collega_google
read '?Premi Invio per chiudere.'
