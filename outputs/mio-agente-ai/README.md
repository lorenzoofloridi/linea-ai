# Mio Agente AI — Linea AI

Piattaforma locale per aiutare le aziende a gestire il primo contatto con i clienti. L’assistente conversa, raccoglie informazioni configurabili e, dopo il consenso al contatto, crea una richiesta nella dashboard dell’azienda corretta.

**Stato verificato: anteprima privata sul Mac.** Nessuna pubblicazione Internet, nessun servizio email mittente configurato. Il modello predefinito è `qwen2.5:7b` su Ollama. Il prodotto è multi-settore; i precedenti moduli dentistici sono conservati per compatibilità e test.

Questo README è la documentazione principale. Le guide in `documentazione/storico/` descrivono versioni precedenti e non devono essere usate per installare o avviare la piattaforma attuale.

## Per chi non è uno sviluppatore

Il **sito** presenta il servizio. Il gestore crea e verifica la scheda aziendale, configura l’assistente e invita le persone autorizzate. Con **Registrati** si può ancora creare uno spazio di prova non verificato; dopo l’accesso attivi la Demo di 7 giorni dalla sezione piani; dalla **dashboard** scegli cosa l’AI deve sapere e quali informazioni raccogliere. Con **Prova la tua AI** apri la chat della tua azienda. Quando il cliente completa la richiesta e dà il consenso, trovi il contatto in **Richieste**.

La chat **Servizi Linea AI** nella home informa sulla piattaforma e indirizza a **Offerte** per i prezzi. Può raccogliere nome, email e richiesta con consenso per il supporto, senza telefono o preferenze orarie. È separata dalla tua azienda: le sue richieste non compaiono nel tuo account e sono conservate sotto l’identità interna `demo`. Non è ancora presente una casella operativa del supporto né un invio email reale; il gestore deve consultare l’archivio locale. Il Mac elabora i messaggi tramite Ollama. I dati restano nei file privati del progetto. L’AI può commettere errori: usa dati fittizi in questa anteprima.

Per iniziare sul Mac già configurato, apri **Apri il sito.command** nella cartella principale del progetto, due livelli sopra questa cartella. Lascia aperto il Terminale che lo avvia. Visita http://127.0.0.1:8765/. Se spegni il Mac o chiudi il server, riapri lo stesso file per riavviarlo. Questo indirizzo funziona solo sul Mac che ospita il sito.

La cartella operativa è **Documenti → GitHub → linea-ai**. Non modificare più la precedente copia Desktop. GitHub Desktop visualizza commit e modifiche di questo repository; un push sul ramo di sviluppo non equivale a una richiesta di deployment. Il ramo collegato all’host non viene aggiornato in questa fase.

## Struttura: servono entrambe le cartelle

```text
cartella-del-progetto/
├── README.md                       → rimando a questa guida
├── AGENTS.md                       → regole permanenti di manutenzione
├── Apri il sito.command            → avvio semplificato del sito
├── prepara-consegna.py             → crea ZIP sorgenti senza dati/credenziali
└── outputs/
    ├── mio-agente-ai/              → questa cartella
    │   ├── README.md               → documentazione principale
    │   ├── Avvia.command           → chat generale nel Terminale
    │   ├── providers/              → adattatore Ollama
    │   ├── llm_locale.py            → interfaccia condivisa del modello
    │   ├── tempistiche.py          → preferenze temporali Europe/Rome
    │   ├── config/                 → modello e configurazione dentistica storica
    │   ├── scripts/                → manutenzione, collegamento Google, controlli
    │   ├── tests/                  → test del motore precedente e componenti condivisi
    │   ├── evals/                  → scenari, confronti e risultati storici del modello
    │   ├── documentazione/         → note tecniche, dati/sicurezza e inventario
    │   ├── legacy/                 → precedenti avvii e demo, non il sito attuale
    │   ├── core/                   → planner e coda lead dei percorsi precedenti
    │   ├── data/                   → archivio privato della precedente coda lead
    │   ├── logs/                   → diagnostica del percorso dentistico precedente
    │   └── .venv/                 → ambiente Python locale, generato
    └── linea-ai-site/
        ├── dist/                  → frontend, pagine e dashboard
        ├── saas/                  → backend della piattaforma corrente
        ├── private-data/          → database e configurazione email privata
        ├── tests/                 → test della piattaforma e dialogo reale
        ├── serve.py               → server HTTP locale
        ├── server_api.py          → inizializzazione backend e worker email
        ├── cli.py                 → stessa AI generale dal Terminale
        └── Avvia-sito.command      → avvio diretto del sito
```

I moduli `bot_core.py`, `comprensione.py`, `dialogo.py`, `fatti_demo.py`, `risposte_paziente.py`, `sheets_store.py` e `sheets_http.py` rimangono nella radice per mantenere gli import dei test, delle valutazioni e degli strumenti precedenti. **Non sono duplicati del nuovo motore SaaS.** Il dettaglio dei file e delle scelte di pulizia è in [documentazione/INVENTARIO.md](documentazione/INVENTARIO.md) e [PULIZIA-2026-09-13.md](documentazione/PULIZIA-2026-09-13.md).

## Tecnologie e installazione

Frontend HTML, CSS e JavaScript senza compilazione; backend Python con libreria standard HTTP e SQLite; Ollama locale; `phonenumbers` per i numeri internazionali. Google OAuth/Sheets e DDGS servono i percorsi precedenti. Non è necessario Node per avviare il sito.

Ambiente verificato su questo Mac: Python 3.14. Installazione consigliata portabile: dalla radice completa usare `python3 -X utf8 linea.py install`, poi `python3 -X utf8 linea.py check` e `python3 -X utf8 linea.py start`. Su Windows usare `py -3.14` oppure i launcher `.bat`. Il runtime essenziale usa `requirements-runtime.lock` con versioni e hash e crea una nuova `.venv`; comprende phonenumbers e tzdata. Non richiede Google/DDGS né l’SDK Ollama. Il file `requirements.txt` conserva le versioni dell’ambiente esistente, incluse le dipendenze storiche; non sono state disinstallate librerie durante il riordino.

Su una nuova copia, dalla cartella `mio-agente-ai`:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes --only-binary=:all: -r requirements-runtime.lock
ollama pull qwen2.5:7b
```

Ollama deve essere installato e in esecuzione. Il download del modello richiede Internet e spazio su disco. Non copiare `.venv` tra computer: ricreala. Mantieni la cartella sorella `linea-ai-site` allo stesso livello.

## Configurazione effettiva

- `config/modello.json`: `provider` = `ollama`, `model` = modello installato. Gli altri campi descrivono il confronto precedente. `providers/ollama_provider.py` legge questa configurazione; in assenza del file usa Qwen2.5:7b.
- Le informazioni e i campi di ciascuna azienda si configurano in **Dashboard → Personalizza l’AI**. Sono salvati nel database, non in `config/azienda_demo.json`. Nuove conversazioni usano la nuova configurazione; quelle già iniziate mantengono lo snapshot iniziale.
- `config/azienda_demo.json` e `prompt.txt`: riguardano soltanto il motore dentistico precedente.
- `credentials.json`, `token.json`, `google_sheets.json`: precedente collegamento Google. Sono privati e conservati nel percorso originario; non servono per creare lead nella nuova dashboard.

### Profili e confini architetturali

`LINEA_ENV=development|test|production` sceglie i default in `config/environments/`. Test usa percorsi propri, non recupera credenziali storiche e disabilita worker automatici/SMTP. Production è predisposto ma l’avvio del runtime è esplicitamente bloccato. I file sono senza segreti; `.env` e variabili del processo restano configurazione dell’installazione.

`saas/lifecycle.py` inizializza database e worker una sola volta e gestisce l’arresto. Importare `server_api` non avvia più thread né crea archivi. `mail.py` gestisce la coda mentre `email_transport.py` contiene il contratto EmailTransport e SMTPTransport. Moduli e limiti di accoppiamento sono descritti in [ARCHITETTURA.md](documentazione/ARCHITETTURA.md), incluso ciò che richiederà davvero il futuro deployment.

### Variabili d’ambiente

La configurazione condivisa è `runtime_config.py`. Copia `.env.example` dalla radice in `.env`, poi imposta i valori. L’ambiente del processo prevale sul file; non viene eseguito codice né espansione shell. Percorsi relativi risolti dalla radice, non dalla directory del terminale. `LINEA_ENV_FILE` può indicare un file alternativo.

- `LINEA_HOST`, `LINEA_PORT`, `LINEA_BASE_URL`: server e link di invito/reset; solo localhost/127.0.0.1 autorizzati in questa fase. BASE_URL vuoto deriva da host/porta.
- `LINEA_DATA_DIR`, `LINEA_DATABASE`: dati persistenti/SQLite; `LINEA_SECRETS_DIR`: segreti; `LINEA_LOG_DIR`, `LINEA_CACHE_DIR`, `LINEA_TEMP_DIR`, `LINEA_BACKUP_DIR`: log, cache, temporanei e backup, separati sotto `var/` per default. I percorsi privati dentro `dist/` sono rifiutati.
- `LINEA_OLLAMA_URL`, `LINEA_MODEL`, `LINEA_MODEL_CONFIG`: servizio locale e modello; la variabile modello prevale sul JSON. Ollama e pesi restano installazioni esterne.
- `LINEA_SMTP_HOST/PORT/USER/PASSWORD/SENDER` oppure `LINEA_SMTP_FILE`: mittente opzionale; nessuna credenziale di esempio reale. Non viene inventata una secret key: le sessioni usano token casuali hashati già nel database.
- `LINEA_GOOGLE_SHEET_ID`, `LINEA_GOOGLE_WORKSHEET`: integrazione storica facoltativa; credenziali/token OAuth cercati nella directory segreti, poi nel percorso storico per compatibilità. `LINEA_CA_FILE` opzionale per CA personalizzata.

Lo script `linea.py migrate-data` copia SQLite e configurazioni riservate nei nuovi percorsi senza sovrascrivere destinazioni esistenti; richiede server arrestato e backup preventivo. Gli originali rimangono conservati. Senza migrazione si mantiene il fallback ai percorsi storici. La separazione riguarda il runtime corrente; alcuni archivi e prove storiche restano conservati nei percorsi precedenti e sono esclusi dal SOURCE.

### Email, verifica dell’indirizzo e recupero password

`saas/email_service.py` è il punto comune per preparare messaggi e accodarli; `mail.enqueue` rimane una facciata compatibile. Registrazione/verifica, recupero password, richiesta prova e conferme lead usano questo servizio. `notify` fornisce inoltre tipi riutilizzabili per appuntamenti, supporto, notifiche e report: i relativi flussi completi/scheduler non sono tutti presenti e non vengono simulati come già operativi. `email_transport.py` separa il trasporto SMTP dal prodotto.

Senza configurazione SMTP i messaggi rimangono catturati nel database con destinatario, oggetto, testo e HTML escapato. Dalla radice eseguire `python3 linea.py emails`: viene stampato il percorso di `email-preview/index.html` nella directory dati. Aprirlo localmente per vedere testo, anteprima HTML e codice HTML; copiarne i link per provare verifica/reset. Rigenerarlo dopo nuove email. È riservato al gestore, contiene collegamenti sensibili e non è servito dal sito né incluso nel SOURCE. I messaggi catturati non vengono spediti retroattivamente quando si configura SMTP. Il reset mantiene anche il precedente file in `local-mail` per compatibilità.

La registrazione prepara una verifica valida 24 ore; **Account** mostra lo stato e permette un nuovo invio limitato. Il link richiede una conferma esplicita sulla pagina `verifica-email.html`: una semplice apertura non consuma il token. Token casuali crittograficamente sicuri, hash nel database, scadenza e uso singolo sono verificati lato server; un nuovo invio invalida i precedenti. Token e messaggio di verifica sono creati nella stessa transazione. La verifica attesta il possesso dell’email, non l’identità aziendale. Per compatibilità dell’anteprima non blocca ancora login o prove per gli account non verificati.

Il recupero password usa token monouso di 30 minuti e revoca tutte le sessioni dopo il cambio. I link usano `LINEA_BASE_URL`. Le copie email contengono necessariamente il token originale: proteggere database e cartella di anteprima come dati privati. Non sono esposte API pubbliche per leggere la posta.

Per invii futuri, `LINEA_SMTP_*` oppure `var/secrets/email.json`/`LINEA_SMTP_FILE` richiedono `host`, `port`, `username`, `password`, `sender`. Porta 465 usa TLS, le altre STARTTLS. Nessun mittente è stato attivato in questa attività. Accettazione SMTP non garantisce consegna nella posta in arrivo. Un esito incerto non viene reinviato automaticamente: serve una procedura di riconciliazione con il futuro provider. SPF, DKIM, DMARC e reputazione spettano alla configurazione futura del mittente, non a un mail server pubblico creato sul Mac.

### Registro pagamenti e webhook locali

`subscriptions.PaymentProvider` mantiene il contratto del provider e l’implementazione mock; `saas/payments.py` conserva operazioni ed eventi nelle nuove tabelle `payment_ledger` e `payment_events`. Supporta esiti riuscito/fallito/annullato, rimborsi parziali/totali, chiavi idempotenti per azienda, deduplicazione e rifiuto di eventi discordanti. I rinnovi mock degli abbonamenti alimentano il registro nella stessa transazione. La disdetta impedisce il prossimo rinnovo; un rimborso non cambia automaticamente i diritti del piano.

**Portafoglio → Laboratorio pagamenti** consente operazioni fittizie di 10 € e rimborso residuo, mostrando esclusivamente la propria azienda. Le operazioni del laboratorio non attivano piani. API locali autenticate: GET `/api/payments`, POST `/api/payment-mock` (`key`, `amount` in centesimi, `outcome`) e `/api/payment-refund` (`payment_id`, `amount`, `key`). Non accettano numeri di carta o CVV.

POST `/api/payment-webhook-mock` usa un protocollo di test, non quello di un provider reale: JSON esatto `event_id`, `payment_id`, `kind`, `amount`, `currency` (EUR); header `X-Mock-Timestamp` Unix e `X-Mock-Signature` HMAC-SHA256 esadecimale su `timestamp + '.' + JSON` ordinato, compatto. `LINEA_PAYMENT_WEBHOOK_SECRET` deve contenere almeno 32 caratteri casuali; vuoto disabilita il webhook. La finestra temporale è 5 minuti. L’azienda deriva dal pagamento preesistente, mai dal corpo della richiesta. Un provider reale richiederà un adapter per firma sul payload originale, checkout ospitato/token, riconciliazione, rimborsi esterni e gestione degli eventi fuori ordine. Nessun provider reale è stato collegato.

## Avvio e uso

- Sito: doppio clic sul launcher principale oppure su `../linea-ai-site/Avvia-sito.command`.
- Avvio manuale, da `mio-agente-ai`:

```sh
cd ../linea-ai-site
../mio-agente-ai/.venv/bin/python serve.py
```

- Chat generale nel Terminale: `Avvia.command`; l’altro launcher `Avvia-assistente-generale.command` lo richiama. Comandi della chat: `/nuovo`, `esci`.
- Manutenzione del precedente collegamento Google: `Collega-Google-Sheets.command`, che esegue `python -m scripts.collega_google` dalla radice. Può avviare l’autorizzazione Google: non serve per il sito attuale.
- Prototipi precedenti, solo se necessari: dalla radice `python -m legacy.agente` (assistente con ricerca web), `python -m legacy.app` (dentistico), `python -m legacy.web_app` (vecchia demo sulla porta 5000). Usare l’interprete `.venv/bin/python`. La vecchia demo non ha isolamento multi-azienda e non va esposta all’esterno.

Ricaricando la home, la pagina torna all’inizio e rimuove il riferimento alla sezione precedente dall’indirizzo. I collegamenti alle sezioni continuano a funzionare durante la navigazione.

Dopo modifiche al codice Python riavvia il server; dopo modifiche al frontend ricarica il browser. Non è presente un aggiornamento automatico del processo Python. Non spostare o pubblicare la cartella `private-data`.

## Accesso e guida dello Spazio Aziendale

La home mostra **Accedi** prima di **Richiedi una prova**. La registrazione è raggiungibile dalla pagina di accesso. Il pulsante con l’occhio rende visibile o nasconde la password; la conferma password resta nascosta. Termini e presa visione della privacy sono obbligatori e distinti; la preferenza per analisi di marketing sui soli dati dell’account è facoltativa, non preselezionata. Non sono attivi strumenti di marketing: viene salvata esclusivamente la scelta. Gli account già esistenti non ricevono consensi retroattivi. La registrazione non verifica la rappresentanza aziendale.

Dopo un login confermato dal server compare il badge verde **Accesso riuscito**, con spunta e annuncio accessibile, per 1,2 secondi prima del reindirizzamento. Un errore non mostra il badge.

Senza **Ricordami**, il cookie è di sessione e l’accesso dura al massimo 8 ore; con Ricordami dura al massimo 30 giorni. Nel browser non viene salvata la password. Logout e reset invalidano le sessioni. L’API di registrazione richiede `password_confirm`, `terms: true`, `privacy: true`; `marketing` è facoltativo. La tabella additiva `registration_consents` conserva la scelta, le versioni dei documenti e la data insieme alla creazione dell’utente nella stessa transazione.

La dashboard separa richieste, conversazioni, scheda aziendale, informazioni per l’AI e autorizzazioni/strumenti. Il pannello degli strumenti è diviso in permessi, identità e obiettivi. Le icone **i** spiegano sezioni e campi al passaggio del cursore, al focus da tastiera o al tocco; Esc chiude la spiegazione. Le frecce della tastiera permettono di cambiare scheda. `dist/dashboard-help.js` gestisce le spiegazioni e `platform.css` l’impaginazione.

## Lingua della home e preferenze cookie

La home ha un selettore Italiano, English, Español e Français a destra del pulsante principale. `dist/site-preferences.js` applica `translations.json` ai testi pubblici, alle offerte e al pannello cookie, anche dopo aggiornamenti dinamici, senza tradurre i messaggi scritti dai visitatori. Le pagine operative della dashboard, i messaggi del backend e le informative estese rimangono in italiano: la localizzazione completa di queste parti resta da completare. La lingua della conversazione AI continua a dipendere dai messaggi del visitatore, non dal selettore del sito.

Al primo accesso alla home compare un pannello non bloccante con Accetta, Rifiuta e Solo obbligatori, collegamento alle informazioni e riapertura dal footer. Attualmente non ci sono cookie facoltativi: tutte le scelte mantengono solo le tecnologie necessarie, senza autorizzare futuri tracciatori. La scelta è conservata in localStorage `linea.cookie-choice` con versione e scadenza di 180 giorni; `linea.language` conserva la lingua fino alla cancellazione dei dati del sito. Nessuna preferenza viene trasmessa a terzi. Se lo storage è bloccato, la navigazione rimane possibile ma la preferenza non persiste. Il cookie di autenticazione resta indipendente da queste scelte.

## Piani e prove locali

Per i visitatori senza accesso resta il modulo **Richiedi una prova**. Dopo login o registrazione si torna alla home: **Prova la Demo** apre la sezione piani al posto del modulo. Demo, Base, Plus e Advanced sono disponibili in simulazione. La voce **Offerte**, accanto a Demo, è sempre visibile: senza accesso mostra i quattro piani senza prezzi e “Inizia subito” apre la normale registrazione. Il modulo di richiesta prova resta disponibile. Dopo accesso i prezzi vengono restituiti dal backend e mostrati; Offerte e Prova la Demo puntano alla stessa sezione.

- **Demo:** 7 giorni dall’attivazione, una volta per email normalizzata. La scadenza è nel database, non nel browser. Alla scadenza il riquadro scompare; i dati restano conservati. Il backend protegge dashboard, API private e apertura della chat aziendale di prova. Anche gli account preesistenti devono attivare una prova o un piano. Il controllo non interrompe le sessioni widget già autorizzate: non costituisce ancora un sistema completo di quote commerciali su tutti i canali.
- **Piani a pagamento simulati:** Base €299/mese o €3.049,80/anno (equivalente €254,15/mese); Plus €599/mese o €6.109,80/anno (€509,15/mese); Advanced €999/mese o €10.189,80/anno (€849,15/mese). Tutte le tariffe annuali risparmiano il 15% sul totale di 12 mesi. Servizi inclusi ancora da definire. La prova dura 14 giorni; richiede dati aziendali, approvazione manuale del gestore, metodo simulato ricorrente e conferma esplicita. Una sola prova commerciale per azienda, indipendentemente dal piano scelto. Plus e Advanced hanno gli stessi passaggi di verifica, metodo simulato, prova di 14 giorni e disdetta del Base. Non è ancora previsto il cambio di piano per un abbonamento già creato.
- **Dati aziendali:** ragione sociale, identificativo fiscale, sito, email e telefono aziendali, referente e ruolo, sede, città, CAP e Paese. Il formato viene controllato, ma questo non dimostra l’identità o la validità fiscale. Modificare i dati richiede una nuova revisione. La revisione del profilo commerciale è distinta dalla precedente verifica della scheda aziendale.
- **Pagamenti:** esclusivamente mock. Carta, Apple Pay, Google Pay, SEPA, PayPal e Revolut Pay sono scelte simulate; non si inseriscono numeri di carta, CVV o IBAN. Il bonifico ordinario è indicato come manuale e non può avviare una prova con rinnovo automatico. Nessun conto viene addebitato.
- **Rinnovo e disdetta:** un worker locale controlla ogni 30 secondi; il controllo avviene anche quando si legge lo stato. Alla scadenza registra un pagamento simulato e attiva il periodo successivo, salvo disdetta. La disdetta dalla pagina di gestione mantiene accesso fino alla scadenza. Quando il server è spento non esegue attività: alla ripartenza elabora lo stato scaduto, senza ricostruire tutti i periodi trascorsi. Il fallimento simulato sospende il piano; recupero pagamenti e riattivazione dopo cancellazione non hanno ancora un flusso dedicato.

`dist/attiva-piano.html` contiene attivazione e gestione; `dist/plans.js` e `plans.css` gestiscono la sezione. `saas/subscriptions.py` centralizza prezzi, scadenze, controllo accessi, contratti dei provider e revisione locale. Le tabelle additive sono `plan_demo_usage`, `plan_profiles`, `plan_subscriptions` e `plan_events`; l’identità aziendale proviene dalla sessione autenticata. Non sono conservate credenziali bancarie. L’audit contiene attore, azienda, operazione, esito, importo simulato e data.

Per il gestore, dalla cartella `linea-ai-site`, elencare gli identificativi e registrare l’esito della revisione dopo aver controllato i dati:

```sh
../mio-agente-ai/.venv/bin/python -m saas.operator list
../mio-agente-ai/.venv/bin/python -m saas.subscriptions COMPANY_ID verified
```

Gli altri esiti sono `rejected` e `needs_review`. Non esiste un’API che consenta all’azienda di approvarsi autonomamente. Per un servizio reale occorreranno verifica adeguata, provider di pagamento autorizzato, gestione sicura dei pagamenti ricorrenti, notifiche del provider, idempotenza e coda delle operazioni, fatturazione e condizioni contrattuali. I riferimenti mock non sono riutilizzabili per addebiti reali.

## Menu dello Spazio Aziendale ed Excel

La barra con logo, menu e uscita resta visibile durante lo scorrimento. Il menu collega Dashboard, Account (dati dell’account e profilo aziendale registrato), Portafoglio (sostituzione del metodo di pagamento simulato del piano) e Supporto (istruzioni e collegamento email a lorenzofloridi@hotmail.com). Queste pagine richiedono autenticazione anche senza un piano attivo; i dati provengono sempre dall’azienda della sessione. Il portafoglio non raccoglie dati bancari reali e non crea carte o mandati reali. `workspace.js`/`workspace.css` gestiscono le nuove pagine.

**Esporta i dati aziendali** scarica `dati-azienda.xlsx` tramite `/api/data-export.xlsx`: Guida, Richieste, Conversazioni, Messaggi, Feedback, Configurazione, Azienda e Attività agente. Intestazioni evidenziate, filtri, prima riga bloccata e testo a capo facilitano la lettura. I campi personalizzati diventano colonne nel foglio Richieste. Tutti i valori sono celle di testo, evitando l’esecuzione di formule contenute nei messaggi; celle oltre il limite Excel di 32.767 caratteri sono troncate e per testi lunghi può essere necessario espandere le righe. L’esportazione JSON precedente resta disponibile nell’API per compatibilità e conserva i testi integrali. `saas/excel_export.py` genera OOXML con la libreria standard senza nuove dipendenze. Non esporta password, sessioni o credenziali. Il file scaricato contiene dati riservati e va protetto dal destinatario.

## Dove sono le funzionalità

| Funzione | File nella cartella sorella `linea-ai-site` |
| --- | --- |
| Home e navigazione | `dist/index.html`, `style.css`, `platform.css`, `navigation.js` |
| Chat e selettore della preferenza | `dist/app.js`, `dist/index.html` |
| Login e registrazione | `dist/account.js`, `login.html`, `registrati.html` |
| Recupero password | `dist/recovery.js`, `recupera-password.html`; `saas/api.py`, `saas/store.py`, `saas/reset_mail.py` |
| Dashboard e campi personalizzati | `dist/dashboard.html`, `dashboard.js`; `saas/store.py` |
| Autenticazione e autorizzazione API | `saas/api.py`, `saas/store.py` |
| Configurazione della chat Servizi Linea AI | `saas/store.py:services_config()`; applicata solo alla demo, le conversazioni già iniziate conservano lo snapshot |
| AI, consenso e creazione lead | `saas/engine.py`, `saas/store.py` |
| Invio email | `saas/mail.py` |
| Schema database | `saas/store.py:init()`, `saas/companies.py:init()`; creazione additiva e ripetibile, nessun framework di migrazione versionata |
| Gestione aziende, inviti, fonti e installazioni | `saas/companies.py`, CLI `saas/operator.py`, `dist/invito.html`, `invite.js` |
| Chat incorporabile | `dist/widget.html`, `widget.js`, `widget.css`; ticket monouso lato backend |
| Informative locali | `dist/privacy.html`, `cookie.html`, `condizioni.html` |

Telefono nella chat aziendale: sono accettate 10 cifre locali, anche separate da spazi, trattini o parentesi, senza richiedere né aggiungere un prefisso. Il dato resta di 10 cifre. Gli altri formati internazionali continuano a essere controllati con phonenumbers. Il controllo del formato non verifica che il numero esista o appartenga al visitatore.

Il flusso è chat aziendale → modello locale → validazione dei dati e consenso → salvataggio → dashboard della stessa azienda. Il backend ricava l’azienda dalla sessione autenticata per leggere e gestire dati privati. Il modello non sceglie company_id e non esegue SQL. Ogni conversazione può creare una sola richiesta, poi aggiornabile, con stati Nuova / Da contattare / In lavorazione / Completata.

## Gestione delle aziende e installazione della chat

La guida operativa è [GESTIONE-AZIENDE.md](documentazione/GESTIONE-AZIENDE.md). Il gestore opera dal Mac con `python -m saas.operator` dalla cartella `linea-ai-site`, usando l’interprete della `.venv`. Nessuna API pubblica permette di verificare aziende, creare inviti o generare ticket di installazione.

- Una registrazione autonoma crea una **nuova azienda non verificata**, anche se il nome coincide con un’altra. Non assegna accesso a un’azienda esistente. Gli account preesistenti rimangono utilizzabili e inizialmente non verificati.
- Il gestore può creare/verificare una scheda e invitare più utenti nella stessa azienda. Gli inviti sono legati a un’email, monouso, validi 24 ore; l’accettazione sceglie una password e apre quella dashboard. La verifica è manuale, non una certificazione automatica di identità. Tutti i membri hanno attualmente gli stessi permessi aziendali.
- Le fonti pubbliche, le informazioni ricevute dall’azienda e le regole hanno una provenienza e uno stato di revisione. Entrano come bozze. Soltanto contenuti verificati e autorizzati per l’AI entrano nelle nuove conversazioni. Le informazioni private escluse rimangono nella scheda e non vengono fornite al modello. Le regole fornite al modello non sono un luogo sicuro per password o segreti.
- La raccolta pubblica rimane **assistita** (è disponibile anche la simulazione di sincronizzazione descritta sotto): si importa un testo da una fonte individuata dal gestore, conservandone il collegamento; non è presente un crawler né una ricerca automatica partendo dal solo nome. Il testo può essere corretto prima dell’approvazione. Il campo preesistente “Informazioni verificate” resta una fonte inserita direttamente dall’utente aziendale.
- Ogni nuova chat conserva configurazione, conoscenza autorizzata e numero di versione. Le modifiche successive non cambiano le chat già iniziate.
- **Prova la tua AI** richiede l’account della stessa azienda. Il suo identificativo pubblico non autorizza a creare chat aziendali anonime. La demo generale rimane disponibile senza login.
- Il widget per i visitatori usa un’installazione associata dal server all’azienda, un’origine autorizzata e un ticket casuale monouso valido 120 secondi. Il visitatore non effettua login. La sessione successiva è limitata alla singola conversazione; non permette letture della dashboard. Una revoca disabilita anche le sessioni dell’installazione.
- Il ticket è una credenziale temporanea: nel test locale viene generato dalla CLI e passato nel frammento URL, rimosso subito dal widget. Non è una chiave permanente da incollare nel sito. Per siti reali occorrerà un’integrazione backend autenticata che emetta un ticket nuovo per ogni apertura, oltre a hosting HTTPS. Questo collegamento esterno **non è attivato**: il server resta su 127.0.0.1.
- La dashboard mostra fonti, stato di verifica, installazioni, feedback dei visitatori e feedback del team sulle conversazioni. Le statistiche di base contano tutte le conversazioni, le richieste e gli stati dell’azienda; la percentuale indica conversazioni con un lead, non vendite o appuntamenti. I feedback non modificano automaticamente configurazioni né addestrano il modello.

## Agente commerciale ibrido — prove locali

Dalla dashboard apri **Agente commerciale: permessi, branding e prove locali**. Le autorizzazioni aziendali sono distinte dal consenso del visitatore. Prenotazioni, voce, WhatsApp, CRM e handoff partono disabilitati; raccolta lead/telefono/email restano abilitate per compatibilità. Le autorizzazioni revocate vengono ricontrollate immediatamente; le nuove abilitazioni richiedono una nuova chat. `agent` è una sezione JSON aggiunta alla configurazione esistente: vecchi client che non la inviano la conservano.

- `saas/policy.py`: validazione di permessi, obiettivi, branding, scoring e reparti.
- `saas/hybrid.py`: tabelle additive, audit azioni, scoring spiegabile, esiti e handoff.
- `saas/adapters.py`: contratti booking/CRM/voce, provider mock, canali locali e credenziali esterne non configurate.
- `saas/hybrid_api.py`: API protette per impostazioni, calendario di prova, conferma, operatore, voce simulata e revisioni.
- `saas/knowledge_sync.py`: pagine autorizzate da fixture HTML locale → estrazione → rilevamento modifiche → revisione → approvazione. Nessun crawler o download automatico di siti reali.
- `saas/languages.py`: messaggi deterministici in italiano, inglese, francese, tedesco e spagnolo. Il modello rileva la lingua nel contesto. Una seconda elaborazione locale può tradurre le risposte libere; questo aumenta la latenza. Date relative e campi personalizzati non sono ancora completamente localizzati.
- `dist/agent-settings.js` e `agent-controls.js`: impostazioni aziendali e azioni disponibili nella home/widget.

**Prenotazioni:** inserisci disponibilità future nel calendario di prova, abilita il permesso e avvia una nuova chat. Dopo aver completato il lead con consenso, il visitatore può selezionare un orario e confermare esplicitamente dal pannello della chat. Il server controlla azienda, permesso, disponibilità e duplicati. Una sola prenotazione per conversazione; modifiche/cancellazioni appuntamenti sono predisposte come permessi ma non eseguibili. Nessun calendario esterno viene toccato. L’AI può indirizzare ai controlli; non invoca autonomamente un tool di prenotazione dal testo libero.

**Voce:** il provider mock riceve una trascrizione digitata e restituisce testo al posto dell’audio. Richiede consenso specifico e usa la stessa cronologia della chat. Non attiva microfono, non trascrive audio reale e non usa la sintesi vocale del browser. STT/TTS reali restano da integrare attraverso i contratti predisposti.

**Handoff:** il visitatore richiede il personale. Nella conversazione la dashboard consente presa in carico, risposta umana, restituzione all’AI e chiusura. Gli stati sono AI_ACTIVE → HANDOFF_REQUESTED → HUMAN_ACTIVE → CLOSED, con ritorno all’AI dove previsto. Le risposte del personale rimangono nella stessa cronologia; il visitatore aggiorna il pannello per leggerle. Non ci sono notifiche push né garanzie di presenza del personale.

**CRM e scoring:** il mock registra nello stesso database soltanto lead consentiti dell’azienda autorizzata. Include dati, campi personalizzati, consenso, riepilogo strutturato, origine, cronologia e punteggio/reparto. Le regole sono deterministiche (present/equals/contains/gte), i contributi sono visibili e il totale è limitato a 100. `gte` richiede numeri non ambigui senza simboli; non interpreta automaticamente “40.000 €”. Il primo reparto corrispondente determina referente/sede; se nessuna regola corrisponde resta da assegnare. Gli esiti commerciali sono separati dagli stati operativi esistenti: nuovo, contattato, appuntamento, qualificato, vendita, perso. Non c’è apprendimento automatico.

**Branding:** nome dell’assistente, saluto, tono, colore, contatti, logo e avatar locali sono configurabili. Il widget usa i propri dati aziendali; il sito commerciale conserva Linea AI. La posizione è un metadato per l’inserimento futuro: non è ancora presente un launcher flottante. Per logo/avatar usare percorsi `/assets/...` senza URL esterni; i file statici sono pubblici nell’anteprima, non archivi riservati. Domini ed email personalizzati non sono attivati.

**Canali:** `LocalChannels` associa il canale a un’azienda nel backend e passa i messaggi allo stesso `engine.respond`. Il canale WhatsApp è solo un simulatore Python server-side; non riceve webhook Meta e non invia messaggi. Il token della conversazione va conservato dal simulatore tra i messaggi. I segreti del binding sono hashati; nessuna chiave permanente viene restituita al widget.

Per la sincronizzazione locale, dalla cartella `linea-ai-site`:

```sh
../mio-agente-ai/.venv/bin/python -m saas.operator sync-local COMPANY_ID https://example.invalid/servizi pagina-di-prova.html
```

Ripetere con la pagina aggiornata rileva il cambiamento; dalla dashboard si legge e approva la proposta. Le versioni precedenti restano conservate e le informazioni private non vengono sovrascritte. Non è presente uno scheduler automatico. Le fonti sono dati non attendibili: l’approvazione deve controllare anche eventuali istruzioni malevole nel testo.

Una guida e il rapporto completo sono in [RAPPORTO-AGENTE-IBRIDO-2026-09-14.md](documentazione/RAPPORTO-AGENTE-IBRIDO-2026-09-14.md). La matrice iniziale è in [AUDIT-AGENTE-IBRIDO-2026-09-14.md](documentazione/AUDIT-AGENTE-IBRIDO-2026-09-14.md).

## Database, dati e log

- `../../var/data/platform.sqlite3` (oppure LINEA_DATABASE; fallback storico conservato): aziende, account, sessioni, recuperi password, conversazioni, messaggi, lead, moduli di prova, feedback e coda email; inoltre schede di verifica, fonti, inviti, installazioni, ticket temporanei, feedback aziendali e registro delle operazioni del gestore. Le nuove tabelle `action_audit`, `booking_slots`, `bookings`, `lead_intelligence`, `crm_mock`, `channel_bindings`, `channel_sessions`, `public_sources`, `public_revisions` mantengono dati e azioni aziendali separati.
- `../linea-ai-site/private-data/backups/pre-company-management.sqlite3`: copia privata manuale precedente all’aggiunta della gestione aziende; non viene aggiornata automaticamente e non è inclusa nella consegna.
- `../linea-ai-site/private-data/website.sqlite3`: vecchio archivio del sito, mantenuto separato.
- `../../var/data/agente.db` è la coda storica copiata; originali in `data/agente.db`, `leads.txt` e Google conservati; nessuna migrazione automatica nella nuova piattaforma.
- `../../var/logs/diagnostica.log` (LINEA_LOG_DIR): diagnostica del motore dentistico precedente. Il server attuale non genera un access log persistente; eventuali errori di processo sono nel Terminale. Non confondere la cronologia chat nel database con un log tecnico.

Le cancellazioni delle conversazioni eliminano anche prenotazioni mock, scoring, esportazioni CRM mock, associazioni canale e audit relativo alla conversazione; le fonti e il calendario aziendale rimangono.

La dashboard permette esportazione e cancellazione dei dati della propria azienda; cancellare una conversazione elimina anche richiesta e feedback associati. Copie esportate e archivi storici non vengono cancellati automaticamente. La conservazione temporale automatica e i backup schedulati non sono configurati; lo script di BACKUP PRIVATO è disponibile. Una sessione scaduta non implica cancellazione della cronologia.

## Test e verifiche

Dalla cartella `mio-agente-ai`, esegui tutti i controlli automatici senza chiamare Google, inviare email o interrogare il modello:

```sh
.venv/bin/python -m scripts.verifica_progetto
```

Le due suite sono `tests/` (30 test) e `../linea-ai-site/tests/test_platform.py` (21 test di compatibilità, 14 test in `test_hybrid.py` 5 test in `test_accounts.py` e 15 test in `test_subscriptions.py`, per 92 test complessivi, inclusi 3 test di architettura (inclusi 2 test recensioni), inclusi 2 controlli del catalogo lingue e dei riferimenti alle preferenze). Comprendono autenticazione, separazione tra aziende, campi personalizzati, lead, consenso, recupero password, esportazione/cancellazione, telefono e coda email simulata. I numeri non sono obiettivi fissi: nuovi test possono aumentarli.

Per verificare anche il server HTTP con registrazione, login, dashboard e lead in un database temporaneo, senza email e con risposte AI simulate:

```sh
.venv/bin/python -B -m scripts.verifica_http
```

Questo controllo apre una porta casuale solo su 127.0.0.1 e la chiude al termine.

Per una verifica con **Ollama reale**, senza scritture Google/email e con database temporaneo:

```sh
cd ../linea-ai-site
../mio-agente-ai/.venv/bin/python tests/model_scenarios.py
```

La verifica reale delle cinque lingue si esegue invece con `python tests/model_languages.py` dalla cartella del sito; scrive `tests/model_languages_result.json` con messaggi fittizi.

Il test model_scenarios scrive un report con dati fittizi in `tests/model_scenarios_result.json`; richiede il modello attivo e può impiegare minuti. Non avviare indiscriminatamente gli script in `work/`: sono prove storiche esterne alla cartella, alcune riferite ad API non più presenti.

## Audit e snapshot di portabilità

L’audit verificato è in [AUDIT-PORTABILITA-2026-09-20.md](documentazione/AUDIT-PORTABILITA-2026-09-20.md). Prima degli interventi è stato creato uno snapshot privato di 216 file con tre copie SQLite consistenti e manifest SHA-256. `verifica-snapshot.py` nella radice controlla archivio e file senza ripristinarli. Il backup include segreti e rimane escluso dalla consegna. Sono stati verificati un ambiente nuovo con sole dipendenze runtime, la risoluzione del fuso orario senza database del sistema e la consegna ZIP estratta in una cartella indipendente con spazi e accenti: 87 test e controllo HTTP passati anche lì. Windows/Linux non sono ancora stati eseguiti realmente: gli avvii sono preparati, non certificati su hardware non disponibile.

`linea.py` usa percorsi relativi al file, seleziona Scripts/python.exe o bin/python, avvia i figli in UTF-8 e mantiene il binding a 127.0.0.1. Installa-Windows.bat/Avvia-Windows.bat e installa.sh/avvia.sh richiamano lo stesso codice. `--environment` permette un ambiente di prova separato; `--wheels` installa offline da wheel già scaricate. Ollama e i pesi restano installazioni esterne.

## Trasferire su un altro computer

Vedi [TRASFERIRE-SU-UN-ALTRO-PC.md](../../TRASFERIRE-SU-UN-ALTRO-PC.md) nella cartella principale. Il progetto contiene codice e dati locali, ma Python, Ollama e i pesi Qwen sono installazioni esterne. Sul computer destinatario occorre creare un nuovo ambiente; non riutilizzare la `.venv` di questo Mac. Lo ZIP per un informatico esclude dati e credenziali.

## Doctor, SOURCE e BACKUP PRIVATO

Dalla radice `python3 -X utf8 linea.py doctor` (Windows: `py -3.14`) controlla Python 3.14, versioni delle dipendenze, configurazione, directory scrivibili, permessi POSIX, almeno 1 GiB libero, integrità SQLite, tabelle/colonne attese confrontate con uno schema temporaneo, porta HTTP, Ollama e disponibilità/metadati del modello. Non invia messaggi né esegue inferenza. Una porta già utilizzata da un HTTP compatibile viene segnalata; non prova l’identità del processo. Su Windows segnala la necessità di controllare ACL: non certifica permessi NTFS. Le migrazioni versionate restano da implementare; il doctor rileva discrepanze dello schema additivo senza migrare il database reale.

`python3 prepara-consegna.py` produce **Linea-AI-SOURCE.zip**, senza ambiente, dati, segreti o backup, con `.env.example`. Il vecchio nome Consegna-informatico-senza-dati.zip è una copia compatibile dello stesso SOURCE. Il pacchetto usa inclusioni consentite e filtri aggiuntivi; non aggiungere file riservati alle directory dei sorgenti. `.gitignore` esclude dati e segreti dalle future aggiunte Git.

`python3 -X utf8 linea.py backup` produce un **PRIVATE-.../snapshot.zip** con manifest SHA-256 in `LINEA_BACKUP_DIR`, includendo codice, configurazione locale e dati/segreti, con copie SQLite coerenti e controllo integrità. Esclude .venv, cache e backup precedenti. È un backup riservato, non cifrato: proteggerne l’accesso e non inviarlo come SOURCE. I file sono sotto `project/`; eventuali dati/segreti configurati esternamente sono sotto `external/`. Il ripristino va eseguito a server fermo in una nuova cartella, ricreando venv e collocando eventuali file external nei percorsi configurati. `verifica-snapshot.py CARTELLA_BACKUP` controlla hash senza ripristino. Variabili segrete presenti soltanto nell’ambiente del sistema non vengono esportate: vanno conservate separatamente in un gestore sicuro.

## Consegna e limiti attuali

Dalla cartella principale `python3 prepara-consegna.py` rigenera `Consegna-informatico-senza-dati.zip` selezionando i sorgenti consentiti. Non include database, token, credenziali, log o `.venv`. Il pacchetto contiene i sorgenti della piattaforma e dei moduli precedenti, ma non gli archivi dati, i vecchi report di valutazione o le configurazioni private Google. Non spedire la cartella operativa completa.

Il prodotto non è ancora un servizio pubblico pronto alla produzione: sono da completare pagamenti reali e offerta commerciale, email reali, verifica email account, infrastruttura HTTPS e disponibilità continua, backup/ripristino, conservazione dati concordata, migrazioni versionate e verifica di sicurezza indipendente. Il Mac elabora una conversazione alla volta; latenza e qualità dipendono dal modello. La validazione riduce gli errori ma non garantisce comprensione perfetta.

Privacy: i documenti descrivono l’anteprima locale, non certificano conformità. Prima di clienti reali occorre definire identità completa del titolare, ruoli con le aziende, finalità/basi giuridiche, conservazione, fornitori e procedure per i diritti e gli incidenti. Vedi [DATI-PRIVACY-SICUREZZA.md](documentazione/DATI-PRIVACY-SICUREZZA.md).

## Recensioni della piattaforma

La home permette di inviare nome pubblico/pseudonimo, voto 1–5 e testo con consenso alla pubblicazione. La tabella `site_reviews` è separata dai feedback privati delle aziende. Le recensioni entrano in attesa, con massimo cinque invii per ora per indirizzo; il sito espone solo quelle approvate, fino a dodici ordinate per voto e data. La vetrina dichiara che si tratta di una selezione; con più di due recensioni scorre nelle due direzioni, si ferma al passaggio del mouse o col pulsante e rispetta la preferenza di movimento ridotto. I testi sono inseriti come testo, non HTML. Non si inventano recensioni né si dichiara verificata l’esperienza.

Moderazione del gestore, dalla cartella `linea-ai-site`:

```sh
../mio-agente-ai/.venv/bin/python -m saas.reviews list
../mio-agente-ai/.venv/bin/python -m saas.reviews approved ID_RECENSIONE
../mio-agente-ai/.venv/bin/python -m saas.reviews rejected ID_RECENSIONE
```

Non esiste un’API pubblica per approvare. La revisione deve controllare dati personali, spam e pertinenza, non soltanto il voto. L’invio non spedisce email. Per revoca/rimozione contattare il gestore all’indirizzo nella pagina Supporto. Le recensioni non hanno scadenza automatica nell’anteprima.

`../../DA-COMPLETARE.txt` raccoglie attività ancora incomplete e motivi, incluse funzioni solo simulate o rinviate per scelta. Va mantenuto a ogni lavoro non concluso, consolidando i duplicati e segnando le risoluzioni verificate.

## Mantenere questa guida

Per ogni modifica significativa verificare codice e configurazione e aggiornare **solo le sezioni interessate** di questo README: struttura, funzioni, dipendenze, database, configurazione, servizi, avvio/test e limiti. Non aggiungere semplici annunci di aggiornamento. La regola permanente è anche in `AGENTS.md` nella radice dell’intero progetto e in questa cartella.
