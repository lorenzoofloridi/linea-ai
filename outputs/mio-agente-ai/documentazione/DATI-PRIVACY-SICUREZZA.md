# Verifica dati, privacy e sicurezza — anteprima locale

Guida operativa principale: [README.md](../README.md). La diagnostica storica è in `logs/diagnostica.log`.

## Implementato e verificato

- Server soltanto su loopback, controlli Host/Origin e API POST same-origin; archivi e credenziali fuori da dist.
- Password con scrypt e salt casuale; sessioni casuali conservate come hash, scadenza e revoca. Cookie HttpOnly/SameSite Strict.
- Recupero password a scadenza e uso singolo, revoca sessioni; invio ancora non configurato.
- Isolamento lato repository e vincoli database tra aziende, test di accesso incrociato, modifica e cancellazione.
- Dati del modello trattati come non attendibili, UI tramite textContent, nessun tool SQL accessibile al modello, validazione telefono e consenso.
- Esportazione aziendale autenticata, cancellazione conversazione + lead + feedback + conferma email associata non in invio. Non cancella esportazioni o copie esterne già esistenti.

## Mappa dei dati

`linea-ai-site/private-data/platform.sqlite3`: account, configurazioni, conversazioni complete, richieste consentite, feedback, coda email e moduli di prova. L’accesso scade, i dati non vengono automaticamente cancellati. Il gestore del Mac può accedere fisicamente al database: separazione tra account non è cifratura del disco. Permessi file riservati; cifratura/backup del dispositivo da verificare con il titolare.

`website.sqlite3`: precedente archivio del sito, conservato. `mio-agente-ai/credentials.json`, `token.json`, `leads.txt`, `data/` e vecchio foglio Google: precedente integrazione dentistica, non migrazione automatica nella piattaforma. Non condividerli nella consegna.

Le chat conservano messaggi anche senza completamento del lead: la UI e l’informativa lo dichiarano prima dell’uso. Il consenso al contatto non va presentato come autorizzazione universale a qualsiasi trattamento dei dati. Per ora usare dati fittizi.

## Da definire prima di clienti reali

Identità e contatti completi del titolare, ruoli/responsabilità con ciascuna azienda, finalità e basi giuridiche, tempi di conservazione per tipo di dato, gestione dei diritti, fornitori e trasferimenti, accordi necessari, risposta agli incidenti e valutazione dei rischi. Le configurazioni non devono chiedere dati sensibili superflui. Il prototipo non effettua decisioni automatiche che concedono o rifiutano servizi.

Non è stato svolto un penetration test indipendente e non viene dichiarata conformità GDPR o sicurezza assoluta. Le prove automatiche coprono gli scenari documentati, non tutte le minacce.

Fonti di riferimento consultate: [OWASP recupero password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP sessioni](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Garante: principi di trattamento](https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/8981258). Minimizzazione e limitazione della conservazione richiedono decisioni concrete del titolare prima dell’uso reale.

## Schede e installazioni aziendali

La scheda include fonti pubbliche/private, autorizzazione all’uso nell’AI e revisioni. I contenuti esclusi non entrano nel contesto del modello; tutti gli utenti della stessa azienda possono però vedere la scheda. Gli inviti usano token memorizzati come hash con scadenza di 24 ore; le installazioni usano ticket monouso di 120 secondi e sessioni revocabili. Non esiste un servizio pubblico di emissione ticket: opera soltanto il gestore locale. Il registro delle operazioni contiene azienda, tipo di azione e data. L’esportazione comprende anche scheda e feedback aziendali; la cancellazione della conversazione rimuove il relativo feedback del team. Non elimina la scheda o gli inviti dell’azienda.

L’incorporamento è limitato all’origine configurata tramite CSP, ma ciò non sostituisce l’autenticazione tra server né le protezioni antiabuso da predisporre per Internet. Le regole passate al modello non devono contenere segreti: non è possibile garantirne la riservatezza con il solo prompt.

## Azioni ibride locali

Consenso al contatto, conferma di prenotazione e consenso a conservare la trascrizione sono distinti dalle capabilities aziendali. In questa versione non si registra audio: la voce è una trascrizione fittizia digitata. I dati CRM rimangono nel mock locale e si cancellano con la conversazione. Il registro azioni non contiene credenziali né testo dei messaggi; cronologia e fonti sono dati applicativi separati. Per le integrazioni reali manca ancora un vault di credenziali: l’interfaccia disponibile non accetta chiavi. Le nuove impostazioni non autorizzano alcuna trasmissione esterna.
