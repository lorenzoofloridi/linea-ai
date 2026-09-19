# Audit prima delle modifiche — 14 settembre 2026

Verifica del codice saas/store.py, companies.py, api.py, engine.py, mail.py, operator.py, serve.py, frontend e test_platform.py. Baseline eseguita: 18/18 test piattaforma superati. Le librerie storiche rimangono separate e compatibili. Nessuna chiamata a servizi aziendali esterni.

| FUNZIONE | GIÀ PRESENTE | PARZIALE | ASSENTE | TESTATA | COSA MANCA |
|---|---|---|---|---|---|
| Multi-company | sì | | | sì | hardening produzione |
| Autenticazione e inviti | sì | | | sì | email reale, ruoli granulari |
| Isolamento aziende | sì | | | sì | nuove superfici da coprire |
| Knowledge pubblica e privata | sì | | | sì | sincronizzazione |
| Approvazione conoscenze | sì | | | sì | revisioni storiche delle fonti |
| Versionamento | | sì | | sì | snapshot chat presenti, cronologia fonti assente |
| Sincronizzazione | | | sì | no | provider, rilevamento modifiche, approvazione |
| Configurazione AI | sì | | | sì | capacità, branding, obiettivi/reparti |
| Lead | sì | | | sì | scoring e risultati commerciali |
| Lead scoring | | | sì | no | regole spiegabili |
| Statistiche | | sì | | sì | lingue, conversioni commerciali |
| White-label | | sì | | no | solo nome azienda; branding completo assente |
| Voce | | | sì | no | provider/mock e consenso |
| Multilingua | | | sì | no | prompt e risposte fisse italiane |
| Prenotazioni | | | sì | no | provider mock, conferma, audit |
| Capabilities | | | sì | no | controlli server-side |
| Handoff umano | | | sì | no | stati, risposte operatore |
| CRM | | | sì | no | interfaccia, mock, consenso e isolamento |
| WhatsApp/canali | | | sì | no | adattatori sul motore condiviso |
| Widget/installazioni | sì | | | sì | integrazione remota intenzionalmente non attiva |
| Audit log | | sì | | sì | azioni con conversazione/attore/esito |
| Test | sì | | | 18 piattaforma | copertura nuove funzioni |

Questa matrice descrive esclusivamente lo stato iniziale. Risultati e limiti dopo l’implementazione sono nel rapporto finale; non riscrivere questo audit come se fosse lo stato corrente.
