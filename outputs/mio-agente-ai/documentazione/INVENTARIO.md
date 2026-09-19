# Inventario dei file mantenuti

Inventario della revisione strutturale: sorgenti, import, percorsi, launcher, test, metadati e configurazione effettiva verificati senza riportare segreti o dati personali. `.venv/` è esclusa dall’elenco puntuale perché contiene pacchetti generati: dipendenze verificate con pip check. Cache rigenerabili non sono sorgenti.

| Percorso da mio-agente-ai | Funzione / motivo della conservazione |
| --- | --- |
| `.gitignore` | Esclusioni per dati privati, ambiente e cache |
| `AGENTS.md` | Regole per manutenzione della documentazione |
| `Avvia-assistente-generale.command` | Alias del launcher corrente |
| `Avvia.command` | Avvio corrente della chat generale del sito |
| `Collega-Google-Sheets.command` | Launcher della precedente integrazione Google |
| `LEGGIMI.md` | Rimando alla guida principale |
| `README.md` | Guida principale permanente |
| `bot_core.py` | Motore dentistico precedente, importato da test/evals e strumenti storici |
| `comprensione.py` | Estrazione semantica dentistica, dipendenza di bot_core |
| `config/azienda_demo.json` | Configurazione: modello attivo o azienda dentistica precedente |
| `config/modello.json` | Configurazione: modello attivo o azienda dentistica precedente |
| `core/__init__.py` | Supporto dei percorsi precedenti, coperto da test |
| `core/lead_outbox.py` | Supporto dei percorsi precedenti, coperto da test |
| `core/planner.py` | Supporto dei percorsi precedenti, coperto da test |
| `credentials.json` | Credenziali private Google, contenuto escluso dall’inventario |
| `data/agente.db` | Database privato precedente, invariato |
| `dialogo.py` | Generazione/verifica risposte del motore dentistico |
| `documentazione/DATI-PRIVACY-SICUREZZA.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/PER-INFORMATICO.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/PULIZIA-2026-09-13.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/storico/AUTONOMIA.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/storico/COLLEGAMENTO_GOOGLE.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/storico/GUIDA_AGENTE.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/storico/LEGGIMI_DENTISTA.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/storico/SPECIFICA_PROGETTO.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `documentazione/storico/STATO_V2.md` | Documento di supporto; lo storico non descrive l’avvio corrente |
| `evals/CONFRONTO_QWEN.md` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/LEGGIMI.md` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/RISULTATI.md` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/confronta.py` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/confronto-gptoss-20260912.jsonl` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/confronto-qwen-llama-20260911.jsonl` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/conversazioni.json` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/pilota-qwen-20260911.jsonl` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/qwen-confronto-manifest.json` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/qwen25-dieci-casi-20260912.jsonl` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/qwen3-dieci-casi-20260912.jsonl` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/seguito-qwen-20260912.json` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/seguito-qwen-prima-ottimizzazione.json` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `evals/verifica_seguito.py` | Scenario/strumento/risultato di valutazione storica, conservato come evidenza |
| `fatti_demo.py` | Informazioni della demo dentistica |
| `google_sheets.json` | Configurazione privata del foglio precedente |
| `leads.txt` | Dati precedenti, conservati senza modificarli |
| `legacy/__init__.py` | Avvio/demo precedente conservato, non usato dal sito SaaS |
| `legacy/agente.py` | Avvio/demo precedente conservato, non usato dal sito SaaS |
| `legacy/app.py` | Avvio/demo precedente conservato, non usato dal sito SaaS |
| `legacy/chatbot_demo.html` | Avvio/demo precedente conservato, non usato dal sito SaaS |
| `legacy/web_app.py` | Avvio/demo precedente conservato, non usato dal sito SaaS |
| `llm_locale.py` | Interfaccia condivisa del modello, importata dal SaaS |
| `logs/diagnostica.log` | Diagnostica precedente, percorso aggiornato e contenuto conservato |
| `prompt.txt` | Istruzioni lette da dialogo.py, da conservare |
| `providers/__init__.py` | Provider Ollama condiviso |
| `providers/ollama_provider.py` | Provider Ollama condiviso |
| `requirements.txt` | Dipendenze bloccate dell’ambiente attuale e storico |
| `risposte_paziente.py` | Alias compatibile delle informazioni dentistiche |
| `scripts/__init__.py` | Strumento di manutenzione/controllo |
| `scripts/collega_google.py` | Strumento di manutenzione/controllo |
| `scripts/seleziona_modello.py` | Strumento di manutenzione/controllo |
| `scripts/verifica_http.py` | Strumento di manutenzione/controllo |
| `scripts/verifica_progetto.py` | Strumento di manutenzione/controllo |
| `sheets_http.py` | Trasporto Google e refresh credenziali usato da sheets_store |
| `sheets_store.py` | Repository del precedente collegamento Google, usato da bot_core |
| `tempistiche.py` | Normalizzazione temporale condivisa con SaaS e test |
| `tests/test_autonomia.py` | Test offline dei componenti condivisi e dentistici |
| `tests/test_contesto_date.py` | Test offline dei componenti condivisi e dentistici |
| `tests/test_provider_outbox.py` | Test offline dei componenti condivisi e dentistici |
| `token.json` | Autorizzazione privata Google, conservata |

## Gestione aziende corrente

`linea-ai-site/saas/companies.py` aggiunge schede verificate, fonti revisionate, inviti, installazioni con ticket, feedback del team e statistiche. `saas/operator.py` è la CLI del gestore. `dist/invito.html` / `invite.js` attivano gli accessi invitati; `widget.html` / `widget.js` / `widget.css` implementano la chat incorporabile locale. Consultare GESTIONE-AZIENDE.md per limiti e configurazione.

## Agente ibrido locale

`saas/policy.py`, `hybrid.py`, `hybrid_api.py`, `adapters.py`, `knowledge_sync.py`, `languages.py` estendono il motore corrente. `dist/agent-settings.js` gestisce configurazione/azioni operatore; `dist/agent-controls.js` le prove visitatore. `tests/test_hybrid.py` verifica le nuove superfici. Il README descrive i limiti dei mock.
