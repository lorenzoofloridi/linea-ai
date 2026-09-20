# Trasferire Linea AI — Mac, Windows, Linux

Il pacchetto sorgenti è indipendente dal Mac. La verifica eseguita è su macOS con Python 3.14; Windows e Linux richiedono ancora una prova sul sistema reale. Nessuna procedura pubblica il sito o apre tunnel.

## Percorso semplice

1. Installa Python **3.14** sul computer destinatario. Su Windows abilita il launcher `py`.
2. Copia/estrai `Linea-AI-SOURCE.zip` in una cartella scrivibile. Non copiare `.venv`, cache o collegamenti simbolici del vecchio workspace.
3. Windows: apri `Installa-Windows.bat`. Mac/Linux: esegui `sh installa.sh` con `python3` corrispondente a Python 3.14. L’installazione scarica solo due pacchetti universali e ne controlla gli hash.
4. Installa Ollama separatamente sul nuovo computer e scarica il modello indicato in `outputs/mio-agente-ai/config/modello.json` (attualmente `ollama pull qwen2.5:7b`). I pesi non sono nello ZIP. Il server Ollama deve essere attivo localmente sulla porta 11434.
5. Verifica: `python3 -X utf8 linea.py check`; su Windows `py -3.14 -X utf8 linea.py check`.
6. Windows: apri `Avvia-Windows.bat`. Mac/Linux: `sh avvia.sh`. Apri http://127.0.0.1:8765/. Lascia il processo aperto; Ctrl+C lo termina. Non viene attivato avvio automatico del sistema.

La pagina può aprirsi anche senza Ollama; le risposte AI richiedono il modello disponibile. I launcher Mac precedenti rimangono validi. Chat da terminale: `linea.py chat` con lo stesso interprete.

## Dipendenze e ambiente

`outputs/mio-agente-ai/requirements-runtime.lock` blocca phonenumbers e tzdata con SHA-256 delle wheel universali. Nessuna dipendenza transitiva nel runtime corrente; SQLite, HTTP e generazione Excel usano la libreria standard. tzdata fornisce Europe/Rome anche quando il sistema non lo include (tipicamente Windows). Il provider usa Ollama via HTTP locale, non ha bisogno dell’SDK Ollama.

`requirements.txt` conserva il freeze dei vecchi strumenti Google/DDGS e include tzdata. È opzionale per la piattaforma attuale e non è stato reinstallato integralmente su Windows/Linux. Per usare quegli strumenti installarlo nella nuova venv e verificarli separatamente.

L’installatore non cancella ambienti esistenti e rifiuta una cartella con struttura incompatibile. Non deve essere usato per convertire una venv copiata da un altro PC. Specificare `--environment CARTELLA_NUOVA` se necessario. Non richiede privilegi amministrativi.

Per preparare un’installazione senza rete, scarica prima le wheel universali:

```
python3 -m pip download --require-hashes --only-binary=:all: --no-deps -r outputs/mio-agente-ai/requirements-runtime.lock -d wheels
python3 -X utf8 linea.py install --wheels wheels
```

Anche Ollama e il modello devono essere già disponibili per lavorare completamente offline. Non sono attivati servizi a pagamento.

## Dati e ripristino

Lo ZIP sorgenti non contiene database, credenziali, backup o conversazioni. Avviandolo nasce un’installazione vuota. Per trasferire l’installazione reale, arresta il server e fai prima una copia privata completa; trasferisci gli archivi SQLite coerenti e i file di configurazione riservati nei medesimi percorsi relativi. Non copiare un database in uso con un semplice trascinamento: usare l’API SQLite backup oppure arrestare completamente il processo. Non sovrascrivere un database destinatario che contenga già dati.

Snapshot iniziale di questa fase: `outputs/linea-ai-site/private-data/backups/portability-20260920`. Include codice, configurazioni e tre database consistenti; esclude .venv, cache, link e backup precedenti. Verifica senza ripristino:

```
python3 verifica-snapshot.py outputs/linea-ai-site/private-data/backups/portability-20260920
```

Per tornare alla versione precedente, arresta il server, conserva anche lo stato corrente ed estrai `snapshot.zip` in una **nuova cartella privata vuota**, poi crea una nuova venv. Non eseguire il rollback sopra un’installazione in uso: annullerebbe eventuali dati aggiunti dopo lo snapshot. Il backup contiene segreti, non deve essere condiviso con l’informatico né inserito nel repository.

Su Windows proteggi la cartella con i permessi del tuo account (ACL): i permessi chmod POSIX non garantiscono la medesima protezione. Su tutti i sistemi usa disco cifrato e backup riservati quando sono presenti dati reali.

## Futuro server

Codice, schema e provider locale rimangono gli stessi. Cambiare modello richiede la configurazione e prove di qualità/schema/latency, non una riscrittura. Il server HTTP corrente rimane deliberatamente locale: per uso pubblico occorreranno una revisione del server applicativo, HTTPS, controllo accessi, gestione processi, backup, monitoraggio, invio email e integrazioni reali. Questa fase non li attiva né certifica capacità 24/7.

## Configurazione e controllo prima dell’avvio

Copia `.env.example` in `.env` nella cartella principale. Imposta modello, porte e percorsi prima di avviare. Esegui `linea.py doctor` con lo stesso Python usato per installare. Segui gli errori riportati; l’assenza di SMTP non impedisce il lavoro locale. SOURCE e BACKUP PRIVATO sono distinti: il primo installa un programma vuoto, il secondo contiene anche dati e segreti. Per crearlo usa `linea.py backup`; per migrare gli archivi storici locali usa `linea.py migrate-data` a server spento e dopo backup.

Clean-install Windows ancora da eseguire sul PC reale: estrazione SOURCE in cartella vuota, Python 3.14, setup, copia .env.example, Ollama/modello, doctor, check, avvio e prova manuale login/chat/export. Conservare esito e versioni prima di dichiarare il collaudo Windows concluso. Nessuna macchina Windows è stata usata in questa sessione.
