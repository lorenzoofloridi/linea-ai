# Clinica Demo Sorriso — revisione 6

Chiudi la chat precedente scrivendo `esci`, poi riapri `Avvia.command`.
La prima riga deve riportare **revisione 6**. `/nuovo` inizia una nuova conversazione.

## Come funziona ora

Il modello locale Qwen interpreta i messaggi e formula risposte usando la cronologia,
le informazioni della demo e i dati già raccolti. Non sceglie soltanto una risposta
fissa da un elenco. Le domande standard restano come guida alla raccolta; una domanda
intermedia riceve prima la propria risposta, senza ripetere subito l'invito precedente.

Il programma decide quali dati accettare e quando può salvare. Una preferenza positiva
per un ricontatto non autorizza ancora la scrittura: resta necessaria la domanda finale
di consenso. Un possibile rifiuto viene verificato separatamente; se non è chiaro,
la chat chiede chiarimenti invece di terminare la richiesta. Un rifiuto esplicito
interrompe la raccolta, ma permette di continuare a fare domande.

## Dati nel foglio

Le cinque colonne restano nome, telefono, trattamento, tempistica, consenso.
Il trattamento include **categoria e parole originali**, per esempio:
`Ortodonzia — richiesta: mettere l'apparecchio`.
La modalità visita aggiunge `— richiesta di visita`; non costituisce una prenotazione.
Il riepilogo mostra il testo destinato al foglio prima del consenso.

Il numero non viene completato o modificato. La tempistica rimane quella espressa dal
paziente, senza trasformarla in una data inventata. È previsto un solo tentativo di invio
per conversazione; se la ricevuta Google non è verificabile, controlla il foglio prima
di iniziare una nuova richiesta. Dopo il salvataggio si può continuare a parlare.

## File attivi

- `bot_core.py`: memoria della richiesta, domande di raccolta, consenso e invio.
- `comprensione.py`: estrazione dei dati dal messaggio.
- `dialogo.py`: verifica della preferenza di contatto e risposta contestuale.
- `prompt.txt`: istruzioni effettivamente lette per formulare ogni risposta.
- `fatti_demo.py`: informazioni disponibili sulla demo.
- `llm_locale.py`: client Ollama locale senza librerie aggiuntive.
- `sheets_store.py` e `collega_google.py`: collegamento Google esistente.
- `app.py`: avvio compatibile che richiama lo stesso motore di `Avvia.command`.
- `risposte_paziente.py`: compatibilità, senza il vecchio classificatore di risposte.

`agente.py` e `Avvia-assistente-generale.command` sono la chat generale separata;
non gestiscono i contatti dentistici. `leads.txt` è il vecchio archivio locale e non
viene importato automaticamente. Le vecchie implementazioni sono conservate fuori
dalla cartella dell'app in `work/revisione4_backup` del progetto.

## Limiti e prove

Il modello è locale e può richiedere diversi secondi per ciascuna risposta. Non è
ChatGPT e può ancora fraintendere: controlla il riepilogo. Non sono disponibili dati
clinici, prezzi o un calendario reale; il bot non può inventarli né dare diagnosi.
Le prove della revisione usano dati fittizi e simulano il salvataggio Google.
Per riconfigurare il collegamento leggi `COLLEGAMENTO_GOOGLE.md`.

## Velocità e salvataggio — revisione 6

Il salvataggio ordinario usa `sheets_http.py`, senza caricare le librerie Google
che rallentavano il primo invio. Riutilizza e rinnova l'autorizzazione già configurata.
Ogni richiesta HTTPS ha un timeout di 12 secondi e la scrittura non viene ripetuta
automaticamente. Il consenso e la verifica della ricevuta restano obbligatori.

Dopo il consenso appare subito “Sto salvando la richiesta su Google Sheets…”.
Durante le altre elaborazioni appare un messaggio d'attesa. I numeri di telefono
inseriti nella fase corretta vengono acquisiti senza il modello; per i semplici
aggiornamenti di dati viene evitata una seconda generazione. Le domande libere
continuano a usare il modello. Ollama mantiene il modello caricato per 20 minuti.

La lettura del foglio è stata verificata realmente; le prove di scrittura della
revisione 6 sono simulate e non aggiungono contatti.
