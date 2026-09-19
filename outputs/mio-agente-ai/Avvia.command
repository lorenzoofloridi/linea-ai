#!/bin/zsh
cd -- "${0:A:h}" || exit 1
printf '\033[2J\033[3J\033[H'
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null; then
    open -a Ollama
    for attempt in {1..30}; do
        curl --silent --fail --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null && break
        sleep 1
    done
fi
./.venv/bin/python ../linea-ai-site/cli.py
read '?Premi Invio per chiudere questa finestra.'
