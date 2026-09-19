# Rapporto sullo sviluppo dell’agente ibrido — 14 settembre 2026

## 1. Cosa esisteva già

Una piattaforma multi-azienda con account e inviti, password hashate, dashboard, conversazioni, lead consentiti, configurazioni per azienda, fonti pubbliche/private revisionabili, snapshot per chat, installazioni con ticket temporanei, feedback e statistiche di base. L’audit iniziale è nel documento separato; prima di modificare il prodotto sono passati i 18 test della piattaforma.

## 2. Cosa era incompleto

Nessun sistema generale di autorizzazioni alle azioni, calendario, voce, CRM, canali alternativi, handoff o scoring. La sincronizzazione delle fonti mancava; il branding era limitato al nome. La conversazione e le conferme erano impostate in italiano.

## 3. Cosa è stato aggiunto realmente

Configurazione `agent` compatibile con le precedenti configurazioni; permessi ricontrollati lato backend; obiettivi, branding, regole per punteggi e reparti; tabelle aggiuntive senza sostituire database/account. Un calendario di prova e conferma separata del visitatore; audit con azienda, conversazione, attore, azione, data ed esito. Provider mock per CRM e voce; adattatore canale locale sul motore comune. Handoff con risposte dell’operatore nella stessa conversazione. Revisione di pagine HTML locali con rilevamento modifiche, approvazione e versioni conservate. Dashboard e controlli chat per provare queste funzioni.

## 4. Cosa è predisposto per il futuro

Interfacce per sostituire i provider mock con calendari, CRM e STT/TTS reali. HubSpot, Salesforce, Pipedrive, webhook e Zapier sono nomi di connettori non configurati: rifiutano l’invio, non sono integrazioni funzionanti. L’archivio credenziali è un’interfaccia che fallisce in assenza di un vault: non accetta né conserva chiavi esterne. WhatsApp non ha un webhook pubblico. Modifica/cancellazione appuntamenti, launcher flottante, domini/email personalizzati e sincronizzazione periodica remota restano da implementare.

## 5. Cosa si può provare completamente sul Mac

Account → azienda → impostazioni → chat → lead → scoring/reparto → dashboard e CRM mock. Disponibilità mock → selezione → consenso già acquisito sul lead + conferma appuntamento → prenotazione mock senza doppia occupazione. Testo → trascrizione vocale digitata con consenso → stesso dialogo; il mock TTS restituisce testo, non audio. Passaggio al personale → risposta umana → ritorno all’AI senza perdere cronologia. Nuova pagina fixture → proposta → approvazione → nuove chat aggiornate, vecchie chat invariate. Le operazioni amministrative di sorgenti e canali avanzati usano ancora lo strumento locale del gestore.

## 6. Cosa richiede servizi esterni

Prenotazioni effettive: sistema aziendale e autorizzazione alla sua API. Voce reale: un provider STT/TTS (locale o esterno) implementato e consenso microfono/audio. CRM reale: connettore specifico, autenticazione, gestione affidabile di errori/retry e vault aziendale. WhatsApp reale: credenziali e autorizzazioni ufficiali, webhook verificati e gestione messaggi. Email: mittente SMTP ancora assente. Nessuna credenziale è stata inventata, nessun servizio esterno aziendale è stato contattato.

## 7. Test

25 test dei componenti precedenti + 18 test di compatibilità SaaS + 14 test dell’agente ibrido: 57 test. Il controllo HTTP verifica server, autenticazione, campi, chat simulata, lead, dashboard e isolamento usando un database temporaneo. Le nuove prove coprono permessi e revoca, booking negato/confermato/duplicato, slot di un’altra azienda, CRM e punteggi spiegabili, branding, voce e consenso, lingua e memoria, handoff, canali, fonti private preservate, snapshot e migrazioni ripetibili. Controllo grafico effettuato su widget e dashboard con azienda fittizia.

Il campione con Qwen reale usa italiano, inglese, francese, tedesco e spagnolo nella stessa conversazione. La prima prova ha evidenziato lingua rilevata corretta ma risposta italiana per l’inglese e richieste di più dati insieme. Sono state corrette istruzioni, localizzazione e controlli. Il risultato finale del campione viene riportato in MULTILINGUA-VERIFICA.md. I test deterministici non equivalgono a una garanzia sulla qualità di ogni risposta del modello.

## 8. Limiti e rischi rimasti

Qwen può ancora produrre risposte schematiche, domande multiple non intercettate o affermazioni inappropriate: i controlli non certificano comprensione perfetta. La traduzione aggiuntiva può aumentare sensibilmente i tempi. Le date relative e le etichette personalizzate non sono completamente multilingua. Le azioni sono attivate dai controlli espliciti della chat: non c’è esecuzione automatica da proposte di tool del modello. La prenotazione richiede un lead già consentito; non supporta ancora prenotazioni senza lead. Gli operatori vedono cronologia e riepilogo del lead, non un nuovo riassunto LLM dedicato. Tutti gli utenti aziendali hanno gli stessi permessi di configurazione: ruoli granulari da aggiungere.

Il mock CRM è transazionale e idempotente nel database, ma non dimostra gestione di guasti/retry di un CRM remoto. Il canale locale conserva solo gli hash delle credenziali e non offre ancora recupero/rinnovo automatico delle sessioni. I file logo sono risorse statiche pubbliche. La posizione del widget è configurazione predisposta, non un elemento flottante già installabile.

## 9. Prima di mettere online la piattaforma

Servono infrastruttura HTTPS, server applicativo adatto, gestione concorrenza/inferenza, sessioni Secure, configurazione origini, protezioni antiabuso distribuite, monitoraggio, backup/ripristino verificato e conservazione dati. Servono inoltre gestione segreti, verifica email/ruoli, verifiche indipendenti di sicurezza e definizione degli accordi/privacy per l’uso reale. Questo lavoro non pubblica né certifica il prodotto.

## 10. Prima di installare sui siti aziendali

Verificare il referente e la configurazione, approvare contenuti/azioni, preparare il backend autenticato che emette ticket temporanei, autorizzare l’origine del sito, configurare il contenitore iframe/launcher e le informative. Collaudare il percorso con ogni azienda e relativi provider. Il browser non deve ricevere chiavi permanenti. In questa fase non è stato collegato nessun sito o numero aziendale reale.
