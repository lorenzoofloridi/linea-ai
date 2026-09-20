# Audit della migrazione online — 20 settembre 2026

Rilevazione precedente a modifiche funzionali. Repository ufficiale `lorenzoofloridi/linea-ai`, branch `dev/netlify-backend`, HEAD iniziale `ba5298b`. `main` locale contiene anche `8fadad8` (non ancora su origin/main): da preservare, non integrare senza autorizzazione. Nessun reset.

## Matrice dello stato reale

| Funzione | Stato online verificato | Evidenza e lavoro necessario |
|---|---|---|
| Collegamento Netlify | Presente | `.netlify/state.json` e dashboard corrispondono al progetto 9e396c73-30cf-4b7c-9224-82e1938aab98. |
| Database PostgreSQL | Raggiungibile | GET /api/health restituisce 200 e database connected. |
| Registrazione | Verificata con due account fittizi | POST register reale riuscito per aziende A e B. Non prova l’invio email. |
| Login/sessione | Verificati via HTTP | Registrazione, sessione, logout/revoca e nuovo login riusciti per A e B; /api/me ignora company_id estraneo. Non sostituisce i futuri test su lead/conversazioni. |
| Password/cookie | Implementati, hardening parziale | scrypt, sessione hashata, HttpOnly/Secure/SameSite=Strict. Mancano rate limit e confronto costante anche per email inesistente. |
| Verifica email | Parziale | Token hashato, scadenza e route presenti; outbox senza mittente online. |
| Recupero password | Assente nel backend online | Il frontend esiste, le route non sono portate. |
| Piani/verifica aziende | Parziale | Lettura stato e catalogo presenti; non tutte le azioni del frontend sono implementate. Pagamenti non reali. |
| Chat pubblica | Assente | POST /api/public e /api/session restituiscono 404 Operazione non disponibile. /api/chat non implementata. |
| AI online | Assente nel codice | Nessuna chiamata a provider in api.mjs. Gateway Netlify da autorizzare prima dei consumi. |
| Demo Servizi Linea AI | Da verificare nel DB | services_config Python è riferimento; schema 0004 non inserisce la demo. |
| Configurazione/knowledge/consenso | Solo motore Python | Portare la logica utile senza avviare Python come server online. |
| Lead/conversazioni/dashboard | Schema, non API | 0004 definisce tabelle con chiavi composite company_id; dashboard mostra errore. Non prova isolamento applicativo. |
| Test/demo vs reale | Da implementare online | Non basta il parametro azienda; preview deve derivare dall'utente autenticato. |
| Google Sheets multi-azienda | Assente online | Servono connettore, autorizzazione, coda persistente e deduplicazione. PostgreSQL fonte primaria. |
| Feedback/richiesta prova | Assenti online | app.js invoca /api/feedback e /api/trial, non implementate. |
| Test Node | Assenti all'inizio dell'audit | Test Python esistenti non attestano il backend Netlify. |

## Contratto frontend da mantenere

- POST public `{company}` → `{name,greeting}`.
- POST session `{company}` → `{session,greeting,name}`; session è un token opaco.
- POST chat `{session,message,contact_preference?}` → `{reply,saved,closed,consent_pending}`.
- POST feedback `{session,rating,comment}` → `{saved}`.
- POST trial `{request_id,name,company,email,message,consent}` → `{saved,email_status}`.
- API dashboard richiedono controllo dell'azienda dalla sessione backend, mai dal solo ID client.

## Migrazioni e dipendenze

0001–0003 sono tracciate. 0004_chat.sql era non tracciata: conservarla senza alterazioni. Applicazione in produzione dichiarata dal proprietario, non ancora confrontata con il registro remoto. Nessuna nuova migrazione applicata in questo audit.

package-lock.json esiste; package.json usa @netlify/database latest, da fissare in un blocco successivo verificato. netlify.toml pubblica outputs/linea-ai-site/dist e netlify/functions. Il generatore SOURCE precedente escludeva completamente il backend Netlify: aggiunto al pacchetto.

## Deploy e limiti della verifica

La dashboard Netlify mostra progetto pubblico e collegamento al repository corretto. L'overview elenca deploy main@0cbbe49 e un orario di pubblicazione successivo: non è sufficiente ad attribuire il codice pubblicato a un commit preciso. Verificare il dettaglio del deploy prima del rilascio. Nessun deploy avviato durante questo audit, nessun merge in main.

AI Gateway: documentazione ufficiale https://docs.netlify.com/build/ai-gateway/overview/ e https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/pricing-for-ai-features/ . Usa i crediti Netlify, non è inferenza illimitata gratuita. Nessuna chiamata al modello effettuata. Ollama e Qwen non sono stati utilizzati né modificati.

Test eseguito: python3 netlify/tests/auth-live.py, due account fittizi distinti, esito positivo. Il comando crea nuovi record di test; non eseguirlo come controllo periodico. Credenziali generate in var/audit (ignorato da Git), nessuna email inviata dal test.

Prossimo blocco: sessioni/chat e provider online autorizzato. Gli step E2E chat/lead/isolation/Sheets/email non sono conclusi.
