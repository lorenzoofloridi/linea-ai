#!/bin/zsh
cd -- "${0:A:h}" || exit 1
umask 077
url='http://127.0.0.1:8765/'
if curl --silent --fail --max-time 2 "${url}api/health" >/dev/null; then
    open "$url"
    exit 0
fi
open -a Ollama
print 'Il sito funziona sul tuo Mac. Lascia aperta questa finestra durante l’uso.'
(
    for attempt in {1..30}; do
        if curl --silent --fail --max-time 2 "${url}api/health" >/dev/null; then
            open "$url"
            exit 0
        fi
        sleep 1
    done
    print 'Il sito non risponde. Controlla il messaggio nella finestra di avvio.'
) &
../mio-agente-ai/.venv/bin/python serve.py
read '?Sito spento. Premi Invio per chiudere.'
