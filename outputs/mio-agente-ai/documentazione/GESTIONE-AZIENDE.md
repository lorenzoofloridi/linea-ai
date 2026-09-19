# Gestione delle aziende — guida del gestore

## In parole semplici

La scheda aziendale è la stanza. Gli inviti danno alle persone autorizzate le chiavi della dashboard. L’installazione porta nella stessa stanza le conversazioni del sito, senza dare al visitatore accesso ai dati degli altri. Un nome aziendale non è una prova di identità: prima di verificare o invitare occorre controllare personalmente il referente.

Questa versione funziona sul Mac. Nessuna azienda reale è stata creata, verificata o invitata durante lo sviluppo. Nessun sito esterno è stato collegato.

## Comandi per uno sviluppatore

Dalla cartella `outputs/linea-ai-site`, sostituire `python` con `../mio-agente-ai/.venv/bin/python`. Gli identificativi qui sotto sono segnaposto, non credenziali.

```sh
python -m saas.operator list
python -m saas.operator create "Azienda di prova"
python -m saas.operator verify COMPANY_ID
python -m saas.operator configure COMPANY_ID configurazione.json
python -m saas.operator invite COMPANY_ID referente@example.invalid
```

`configure` accetta lo stesso oggetto di configurazione della dashboard. Per ricavare un modello usare `store.default_config()`; non include i dati di altre aziende. Verificare sempre che COMPANY_ID sia quello desiderato. L’invito restituisce un collegamento locale monouso: comunicarlo soltanto al referente corretto; non viene inviata alcuna email automaticamente. Il destinatario sceglie personalmente la password. Non viene stampata né salvata una password in chiaro.

## Conoscenza pubblica e privata

Individuare il sito ufficiale; leggere e selezionare i fatti affidabili, senza presentare deduzioni come informazioni aziendali. Salvare in un file di testo il contenuto proposto, quindi importarlo:

```sh
python -m saas.operator knowledge COMPANY_ID public fatti.txt https://example.invalid/servizi
python -m saas.operator knowledge COMPANY_ID private colloquio.txt "Colloquio con referente autorizzato"
python -m saas.operator knowledge COMPANY_ID rule regole.txt "Indicazioni approvate dal referente"
python -m saas.operator show COMPANY_ID
python -m saas.operator approve-knowledge COMPANY_ID ENTRY_ID fatti-corretti.txt --allow-ai
```

Senza `--allow-ai`, il contenuto verificato rimane escluso dal modello. Tutti i membri aziendali possono vedere la scheda; non è un archivio segreto riservato al gestore. Le informazioni passate al modello devono essere adatte al dialogo: non inserire credenziali, documenti riservati o dati sanitari. Le regole guidano l’assistente ma una difesa tramite prompt non garantisce la riservatezza del loro testo. La ricerca automatica e l’importazione di documenti non sono implementate.

## Widget e prova locale

```sh
python -m saas.operator install COMPANY_ID http://127.0.0.1:9000
python -m saas.operator ticket INSTALLATION_ID
python -m saas.operator revoke INSTALLATION_ID
```

Il comando ticket restituisce un URL utilizzabile entro 120 secondi una sola volta, come `src` di un iframe su una pagina locale servita dall’origine autorizzata. Per una prova senza iframe si può aprire direttamente l’URL. A ogni riapertura serve un nuovo ticket. L’URL non contiene company_id: il server risolve installazione → azienda, con controlli su scadenza, uso e revoca. Non copiare un ticket statico nel sito definitivo.

L’iframe usa un documento separato e `frame-ancestors` limitato all’origine configurata; le API restano della stessa origine del widget, senza CORS aperto. Il ticket va generato in un backend fidato, mai tramite una chiave permanente nel JavaScript. La CLI implementa il lato locale di emissione; il canale autenticato tra server del sito aziendale e piattaforma, HTTPS, hosting, limiti distribuiti e gestione degli abusi sono lavoro necessario prima di installazioni reali. L’origine autorizzata limita l’incorporamento nel browser, non certifica da sola l’identità di un chiamante HTTP.

## Isolamento e manutenzione

Tutte le letture della stanza derivano dall’account autenticato, non da company_id fornito dal browser. Le chat usano un token per la sola conversazione. I vincoli dei messaggi, lead e feedback includono l’azienda. Fonti, installazioni, inviti e revisioni sono associati alla stessa identità. Il registro delle operazioni conserva evento, azienda e data senza testo riservato o token.

Avviando la nuova versione vengono aggiunte tabelle senza cancellare le esistenti. Gli account preesistenti non vengono approvati automaticamente. Fare backup del database prima di interventi operativi futuri; l’anteprima non ha backup automatici. Le tabelle temporanee degli inviti e delle sessioni richiedono ancora una politica completa di conservazione.

Eseguire i test indicati nel README. Quelli HTTP verificano con un archivio temporaneo il passaggio installazione → chat → lead → dashboard corretta. Le suite verificano anche inviti monouso, ticket errati/scaduti, isolamento, revoca, versioni e fonti escluse dal modello.
