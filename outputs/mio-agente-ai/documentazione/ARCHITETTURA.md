# Architettura e preparazione al deployment

## Esito della revisione

Linea AI è un monolite modulare locale, non un insieme di microservizi. Per le dimensioni attuali è una scelta gestibile: non occorre dividere ogni funzione in un servizio indipendente. Esistono tuttavia dipendenze esplicite da SQLite e processi singoli che vanno considerate prima di produzione.

| Area | Responsabilità e confine | Stato / lavoro futuro |
|---|---|---|
| Trasporto HTTP | serve.py e server_api.py | Handler locale; futuro server di produzione/reverse proxy separabile |
| Avvio/arresto | saas/lifecycle.py | Init esplicito, worker avviati una volta, evento di arresto; import senza scritture DB |
| Auth, utenti, sessioni, persistenza | saas/store.py | Repository condiviso e SQL per tenant; non va duplicato nei connettori |
| Routing/autorizzazioni | saas/api.py e hybrid_api.py | Sessione e permessi prima delle operazioni; file da suddividere per dominio quando crescono, non duplicare controlli |
| Aziende, inviti, conoscenze | companies.py, knowledge_sync.py | Contesto/versioni, revisione e provenienza; niente crawler reale |
| AI e conversazioni | engine.py, llm_locale.py, providers/ollama_provider.py | Provider modello separato; motore conserva validazione/consenso. Nuovo modello richiede test di output strutturato |
| CRM, calendario, voce, canali | adapters.py | Contratti già presenti e mock; alcuni mock usano SQL e transazioni, non riutilizzare quel modello per chiamate esterne lente |
| Email | mail.py + email_transport.py | Coda, stati e recupero in mail; SMTPTransport implementa EmailTransport. Sostituire il trasporto non cambia coda o tenant |
| Pagamenti/abbonamenti | subscriptions.py | Contratto provider e lifecycle locale; per provider reali serve outbox/idempotenza/webhook autenticati, non chiamare rete dentro transazione SQLite |
| Lead, scoring e handoff | hybrid.py, policy.py | Regole per azienda, audit e stato; notifiche/presenza restano futuri |
| Recensioni | reviews.py | Dati piattaforma e moderazione separati dai feedback aziendali |
| Supporto | pagine account/portafoglio/supporto, richieste demo | Non esiste ancora un sistema ticket; non descriverlo come tale |
| Report | store.export_company, excel_export.py e statistiche overview | Esportazione e statistiche locali; niente scheduler report completo |
| Configurazione | runtime_config.py + config/environments | development/test/production; environment prevale sui default |

## Profili e sicurezza operativa

LINEA_ENV seleziona development (default), test o production. Ogni profilo ha un file JSON privo di segreti. Test usa directory separate, non eredita credenziali storiche e disabilita SMTP e worker automatici. Configurare test verso le directory standard di sviluppo viene rifiutato; chi sceglie percorsi personalizzati deve comunque garantirne l’isolamento. Le suite esistenti continuano a usare database temporanei dedicati.

Production è un profilo di preparazione, non un’autorizzazione al rilascio. Il runtime web/lifecycle rifiuta l’avvio; nessun dominio, certificato, tunnel o firewall viene configurato. Anche development rimane su loopback. LINEA_BASE_URL è distinto dal binding e servirà per i link esterni, ma in questa fase sono accettati solo URL locali.

Un futuro deployment richiederà interventi concentrati sul bordo HTTP e sulle operazioni: server applicativo supportato, TLS/reverse proxy, validazione Host/Origin, proxy fidati e cookie Secure. Non fidarsi indiscriminatamente di X-Forwarded-Host/Proto. I link pubblici dovranno derivare dalla configurazione approvata, non dagli header arbitrari del browser.

## Cosa il futuro server richiederà ancora

- Provisioning, DNS/dominio, HTTPS, firewall e supervisione dei processi: non attivati.
- Monitoraggio, log sanitizzati, metriche e allarmi; backup cifrati esterni con prove di ripristino.
- Worker eseguibili separatamente, coda durevole e coordinamento tra processi prima di usare più istanze. I lock attuali sono in memoria, non distribuiti.
- Migrazioni versionate e valutazione dei limiti SQLite/concorrenza; eventuale database diverso tramite repository, non SQL copiato nelle UI.
- Credenziali per azienda e provider reali, gestione retry/idempotenza. Le autorizzazioni aziendali e il consenso del visitatore restano nel dominio, non delegati all’LLM.
- Verifica sicurezza/ruoli/privacy e collaudo Windows/Linux. Il codice attuale non costituisce un servizio production-ready.

Queste lacune non richiedono di riscrivere la UI o la logica conversazionale da zero, ma non sarebbe corretto promettere che il rilascio consista soltanto nell’installazione del server.
