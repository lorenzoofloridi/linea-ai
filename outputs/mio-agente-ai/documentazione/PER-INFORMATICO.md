# Architettura e consegna — 13 settembre 2026

Guida principale: [README.md](../README.md). Per la struttura corrente e i nuovi percorsi dei prototipi/strumenti fare riferimento al README e all’inventario.

## Entry point e responsabilità

`outputs/linea-ai-site/serve.py`: HTTP stdlib, bind esclusivo 127.0.0.1:8765, dist come unica directory pubblica. `server_api.py` inizializza storage e worker email. `saas/api.py` autorizzazione e routing; `saas/store.py` repository SQLite; `saas/engine.py` orchestrazione e validazione; `saas/mail.py` coda SMTP. `cli.py` riusa lo stesso motore del sito.

`outputs/mio-agente-ai/providers/ollama_provider.py` e `llm_locale.py` gestiscono Qwen2.5:7b locale. `tempistiche.py` normalizza le preferenze con Europe/Rome. `requirements.txt` include phonenumbers. Configurazione Ollama locale già esistente mantenuta. Python dell’ambiente locale è 3.14.

## Isolamento

Ogni handler privato deriva company_id dalla sessione autenticata. Parametri company_id del client non autorizzano nulla. Query lead/conversazione/stato/esportazione/cancellazione sono filtrate per company_id. Chiavi e vincoli esterni compositi impediscono l’associazione tra aziende diverse. Il token pubblico aziendale seleziona il chatbot ma non concede accesso alla dashboard. Ogni chat ha una capability casuale separata e uno snapshot di configurazione. Il modello non esegue SQL né determina l’azienda di destinazione.

## AI e dati

Una chiamata strutturata per messaggio: dati con citazioni, azione, risposta, consenso. Le citazioni devono esistere nell’ultimo messaggio; testo generico configurabile viene conservato dalla citazione, telefono validato con metadata, tempi normalizzati. Il programma controlla campi obbligatori e consenso prima della transazione. Un lead per conversazione, aggiornamenti alla stessa riga. La conferma appare solo dopo commit. La qualità semantica resta dipendente dal modello: non è una garanzia di assenza di allucinazioni. La prova reale è in tests/model_scenarios_result.json, con dati fittizi; circa 23–36 secondi per turno sul Mac durante la prova.

## Esecuzione e test

Avviare `Avvia-sito.command` dalla cartella del sito. Non esporre questo server locale su 0.0.0.0. Nuove dipendenze: installare requirements.txt nell’ambiente Python. Ollama deve avere qwen2.5:7b.

Test: dalla cartella del sito, `../mio-agente-ai/.venv/bin/python -m unittest discover -s tests -p test_platform.py`. Il test modello reale è separato e usa archivi temporanei, non Google o email. Non usare dati reali nei test.

## Email e recupero

Nessun mittente è configurato. `saas/mail.py` legge `private-data/email.json` (host, port, username, password, sender). Mai includerlo nel sito o nel repository. SMTP TLS obbligatorio; accettazione SMTP non significa consegna in casella. Esiti incerti non vengono reinviati automaticamente. La coda usa chiave evento univoca.

Il recupero usa token casuali, hash nello storage reset, durata 30 minuti e singolo uso. Il cambio revoca tutte le sessioni. Link nel frammento URL, rimosso dalla barra e non dai log server perché non inviato via HTTP. La coda email contiene temporaneamente il link e va protetta. Risposta uniforme per account inesistente/esistente. Senza mittente l’endpoint segnala servizio non attivo e non genera recuperi. URL localhost intenzionale: prima di qualsiasi distribuzione esterna serve origine HTTPS configurata e fidata.

## Limiti da risolvere prima di uso pubblico

Anteprima locale: non deployment SaaS di produzione. Mancano verifica email account, MFA, inviti/multipli utenti per azienda, infrastruttura HTTPS, rate limit distribuito, audit esterno, monitoraggio, backup cifrati e restore provati, conservazione automatica concordata. Cookie Secure da abilitare su HTTPS, oltre a HttpOnly/SameSite già presenti. SQLite e il lock del modello serializzano l’inferenza sul Mac. Documenti privacy sono informativi provvisori, non certificazione. I segreti Google precedenti e gli archivi esistenti NON fanno parte della consegna sorgenti.

## Esito verifiche finali

13 test automatici superati: isolamento lettura/scrittura/cancellazione, vincoli tra aziende, autenticazione, recupero password monouso/scadenza/revoca, validazione telefono, consenso e idempotenza, email simulate. Controlli HTTP reali: 401 senza login, 403 per origine assente/estranea, 404 per archivi privati e credenziali. UI verificata: login, dashboard con stato e configurazione, recupero non configurato, home. Scenario reale Qwen completato con zona, budget, data, consenso e chiusura. Nessuna email reale inviata, nessuna pubblicazione eseguita.
