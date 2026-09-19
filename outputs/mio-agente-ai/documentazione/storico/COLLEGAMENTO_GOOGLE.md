# Collegamento Google Sheets

Destinazione scelta: [Lead AI Responder](https://docs.google.com/spreadsheets/d/1mU-tlfESedZVPBX-HXdOi0y9VYQ67uhya7oo6RXto9M/edit).
Scheda: Foglio1. Colonne esistenti: Nome, Telefono, Trattamento, Tempistica, Consenso ricontatto.

Il programma usa Google Sheets API con OAuth per un’app desktop, secondo la
[guida ufficiale Google](https://developers.google.com/workspace/sheets/api/quickstart/python).
L’accesso al foglio nel browser non autorizza automaticamente il programma Python.

## Stato della configurazione

Progetto Google Cloud creato: Clinica Demo Sorriso (`formal-shell-508120-n7`).
Google Sheets API attiva; client desktop creato; accesso OAuth autorizzato e configurazione salvata.
Verifica completata: una chat ha salvato una sola riga fittizia “Test Collegamento”,
letta nuovamente da Google con i cinque valori corretti. Il collegamento è attivo.
I passaggi sotto servono solo per una futura riconfigurazione.

## Configurazione iniziale

1. Apri [Google Cloud](https://console.cloud.google.com/apis/credentials).
   Al primo accesso, leggi e accetta personalmente i termini se intendi procedere.
2. Crea/seleziona un progetto dedicato alla demo e abilita Google Sheets API nella Libreria.
3. Configura Google Auth Platform: nome applicazione Clinica Demo Sorriso,
   indirizzo di supporto e contatto del tuo account. Per uso personale di prova
   seleziona pubblico esterno, mantieni la modalità Test e aggiungi il tuo account
   fra gli utenti di test.
4. Crea un client OAuth di tipo App desktop. Scarica il JSON nella cartella
   mio-agente-ai e chiamalo `credentials.json`. Non incollarne il contenuto in chat.
5. Apri `Collega-Google-Sheets.command`: si apre il browser per l’autorizzazione.
   Il programma richiede accesso in lettura/scrittura ai fogli Google tramite lo scope
   Sheets; usa nel codice solo il foglio indicato sopra. Leggi i permessi prima di autorizzare.
6. Dopo l’accesso, viene verificata la prima riga del foglio e salvata la configurazione.
   Apri `Avvia.command` e prova con dati fittizi. Dopo il consenso verifica la riga nel foglio.

Il token di accesso viene conservato localmente in `token.json`, leggibile solo dal
proprietario del file. Non condividere `credentials.json` o `token.json`.
In modalità Test Google può richiedere nuovamente l’autorizzazione: riapri il collegamento.

## Comportamento del salvataggio

Una chiamata Add to sheet invia esattamente cinque valori in ordine:
nome | telefono | trattamento | tempistica | sì.
Il telefono resta identico a quello fornito, compresi spazi e prefisso.
I valori sono scritti come testo, senza eseguire formule contenute nei messaggi.
La conferma viene mostrata solo se la risposta di Google contiene una riga e i valori attesi.
In caso di errore non viene tentato un secondo invio nella stessa conversazione:
controlla il foglio prima di iniziarne un’altra, perché un errore di rete può arrivare
anche dopo un salvataggio riuscito.

Il vecchio `leads.txt` non viene importato né usato per nuovi contatti.
