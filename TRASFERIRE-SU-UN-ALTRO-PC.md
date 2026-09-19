# Trasferire Mio Agente AI su un altro computer

Questa cartella contiene il progetto: sito, codice AI, dati locali, configurazioni, guide e avvii. Mantieni insieme le due cartelle in `outputs`.

## Cosa non è contenuto nella cartella

Python, l’applicazione Ollama e i pesi del modello Qwen sono installati separatamente sul Mac. Sul nuovo computer vanno installati nuovamente. La cartella `.venv` presente è l’ambiente di questo Mac: non è portabile su Windows, Linux o un altro percorso. Non usarla sul nuovo PC.

## Se trasferisci tutto su un tuo computer

1. Chiudi il sito e la chat prima di copiare, così i database non vengono modificati durante il trasferimento.
2. Trasferisci l’intera cartella con un metodo riservato. Contiene anche account, messaggi e autorizzazioni Google: non pubblicarla e non condividerla liberamente.
3. Installa Python compatibile (ambiente verificato su Python 3.14) e Ollama sul nuovo computer.
4. Avvia Ollama e scarica il modello con `ollama pull qwen2.5:7b`.
5. Crea un ambiente nuovo come spiegato sotto. I dati del sito restano in `outputs/linea-ai-site/private-data`; non sostituirli con archivi vuoti.

### Windows — dalla cartella principale, nel Terminale

```bat
py -3 -m venv .venv-pc
.venv-pc\Scripts\python.exe -m pip install phonenumbers==9.0.39
.venv-pc\Scripts\python.exe outputs\linea-ai-site\serve.py
```

### Altro Mac o Linux — dalla cartella principale

```sh
python3 -m venv .venv-pc
.venv-pc/bin/python -m pip install phonenumbers==9.0.39
.venv-pc/bin/python outputs/linea-ai-site/serve.py
```

Poi apri http://127.0.0.1:8765/ sul nuovo computer e lascia aperto il Terminale. Questi comandi avviano la piattaforma generale; per i vecchi strumenti Google/ricerca web servono anche le dipendenze complete di `outputs/mio-agente-ai/requirements.txt`. L’autorizzazione Google potrebbe richiedere un nuovo accesso. Le email non diventano attive con il trasferimento: manca ancora il mittente.

Non è stata effettuata una prova su Windows o Linux: le istruzioni usano gli entry point Python esistenti; gli avvii `.command` sono specifici del Mac.

## Se consegni il lavoro a un informatico

Usa `Consegna-informatico-senza-dati.zip`: contiene sorgenti e guide, senza account, chat, database o credenziali. Chi lo riceve crea un ambiente e dati di prova propri. La cartella completa è invece la copia operativa privata del progetto.

Documentazione principale: [README](outputs/mio-agente-ai/README.md).
