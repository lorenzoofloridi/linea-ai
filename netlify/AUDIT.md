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

## Aggiornamento 24 settembre 2026 — AI Gemini diretta e quote mensili

- Adapter unico `netlify/lib/ai/provider.mjs` (`generate`, `aiReady`, `AIError`) con provider `gemini.mjs`: endpoint fisso `generativelanguage.googleapis.com`, chiave `LINEA_GEMINI_API_KEY` solo in header, corpo degli errori mai letto né loggato. Le variabili dell'AI Gateway non sono più usate.
- `online-ai.mjs` (chat) e `company-research.mjs` (ricerca) passano dall'adapter; la ricerca non chiede più `responseMimeType` JSON insieme agli strumenti di ricerca (combinazione non supportata da Gemini) ed estrae il JSON dal testo.
- Quote: migrazione additiva `0008_ai_usage.sql`; `ai-quota.mjs` calcola il piano effettivo solo dal database (abbonamento attivo, poi Demo), riserva il messaggio con un unico `INSERT … ON CONFLICT DO UPDATE … WHERE used < limite` prima di Gemini e lo rilascia se il modello fallisce. Il vecchio limite fisso 60/giorno per azienda è sostituito da quota mensile + anti-raffica al minuto; resta il tetto globale giornaliero `LINEA_AI_DAILY_LIMIT` (da alzare prima dei clienti reali).
- `requireActivePlan` della chat usa la stessa funzione `effectivePlan`. `planEntitlements` in `api.mjs` usa ancora una regola propria (Demo solo senza abbonamento): da unificare.
- `company-research-background` era invocabile pubblicamente con qualsiasi `company_id`: ora richiede l'header interno firmato con `LINEA_INTERNAL_SECRET` e una ricerca in stato `pending`.
- Verifica: `npm test` (adapter, quote, periodo, segreto interno) e `npm run test:database` (quota prima del modello, isolamento tra aziende, rilascio su errore, cambio piano, `/api/ai-usage`). Nessuna chiamata reale a Gemini e nessun deploy in questa sessione.

### Integrazione con le modifiche locali Ollama (24 settembre 2026)

Le modifiche non committate sul Mac (provider Ollama Cloud, lettura del sito, `normalizeKnowledge`, validazioni della background function, `PUBLIC_SITE_URL`) sono state integrate: Gemini resta predefinito, Ollama diventa provider di riserva nell'adapter. La lettura del sito segue i redirect manualmente e verifica via DNS che ogni host risolva solo verso IP pubblici (IPv4/IPv6). Rimossi i log che includevano risposte Resend, oggetti errore completi, risposte del modello o corpi d'errore dei provider.

## Aggiornamento 24 settembre 2026 — database su Supabase

Motivo: il calcolo di Netlify Database ha consumato 30–60 crediti al giorno anche senza clienti (130 dei 331 crediti del 20–22 settembre, gli altri quasi tutti in deploy di produzione). Il database passa a PostgreSQL su Supabase (Frankfurt, piano Free), coerente con l'architettura PostgreSQL/pgvector.

- `netlify/lib/db.mjs` sostituisce `@netlify/database` con `pg` e la stessa interfaccia `{ pool }`; TLS obbligatorio con verifica del certificato CA di Supabase; nessuna credenziale nei messaggi d'errore.
- Migrazioni spostate in `database/migrations`: Netlify non le applica più durante il deploy. `scripts/migrate.mjs` (status/migrate/check) le applica dal Mac con checksum, una transazione per file e lock consultivo.
- 0009: RLS su tutte le tabelle, revoca dei privilegi ad `anon`/`authenticated` anche per le tabelle future. Verificato su PostgreSQL 16 locale con ruoli simulati (182 privilegi → 0).
- Si riparte da zero: i dati su Netlify Database erano solo account di prova. Netlify Database va rimosso dal progetto dopo il passaggio.
- Modello predefinito aggiornato a `gemini-3.5-flash-lite` (i 2.5 sono riservati ai progetti che li usavano già); ragionamento minimo con `thinkingLevel` per i 3.x e `thinkingBudget: 0` per i 2.x.
- Latenza: le Functions restano a IAD (US East; la regione si cambia solo con piani superiori) e il database è a Frankfurt, circa 90 ms per query. Da misurare dopo il deploy; eventuale riduzione del numero di query per richiesta.

## Aggiornamento 25 settembre 2026 — revisione del sito

- Nuove migrazioni additive con RLS: `0010_password_reset.sql` (token di recupero, solo hash) e `0011_company_notes.sql` (note sulle conversazioni, FK composta per azienda).
- `netlify/lib/password-reset.mjs` + `mailer.mjs`: `POST /api/password-request` risponde sempre con lo stesso messaggio (nessuna enumerazione), limiti 5/IP/15 min e 3/email/ora; `POST /api/password-reset` consuma il token in transazione, aggiorna la password e chiude tutte le sessioni. Email via Resend con Idempotency-Key; nei log solo codici/stati HTTP.
- `netlify/lib/company-data.mjs`: `GET /api/company-overview`, `POST /api/company-review` (note), `POST /api/data-delete` (richiede `confirm: true`), `GET /api/data-export.xlsx` (file Excel generato da `netlify/lib/xlsx.mjs`, solo celle di testo: nessuna formula viene interpretata; usato dal pulsante «Esporta dati») e `GET /api/data-export.csv` (CSV con protezione da formula injection, mantenuto per compatibilità). Ogni query è filtrata per `company_id` della sessione; test di isolamento in `chat-database.test.mjs`.
- Frontend: rimossi pagamenti simulati, strumenti agente non collegati e recensioni (nascoste finché non esiste il backend); prezzi e quote pubblici; CTA unica «Prova gratis»; piani a pagamento attivati con il team; menu mobile; intestazione comune dell'area riservata; card consumi AI in dashboard e in «Piano e consumi»; informative privacy/condizioni/cookie riscritte con i fornitori reali (da completare con identità legale e revisione legale).
- Login verificato → `/dashboard.html`. Verifica: `npm test` (33 test), `npm run test:database`, controllo Playwright desktop/mobile senza errori console, 404 o overflow orizzontale.

### Correzioni 25 settembre 2026 (richieste del proprietario)

- Prezzi visibili solo dopo il login: `publicPlanCatalogue` non invia più gli importi; gli ospiti vedono nome, messaggi inclusi e «Accedi o registrati per vedere la tariffa».
- Recensioni ripristinate con backend online: `0012_site_reviews.sql` (RLS, consenso obbligatorio, stato pending/approved/rejected), `netlify/lib/site-reviews.mjs`, route `/api/site-reviews`, moderazione `scripts/reviews.mjs` (`npm run reviews`). Il testo è mostrato con textContent (nessun HTML interpretato).
- Offerte: card centrate anche nella vista annuale (tre piani). Login: il link «Registrati» non rimanda più al login quando è salvata una scelta di piano.

### Feedback (25 settembre 2026)

- `0013_feedback_dates.sql`: colonna `created_at` e indice per azienda. `companyOverview` restituisce tutti i feedback (anche senza commento) con data, conteggio, media totale e media del mese (Europe/Rome).
- Chat della home (`kind = public_demo`): `scripts/feedback.mjs` (`npm run feedback`) legge solo quei feedback e le loro conversazioni; le conversazioni delle aziende clienti non sono accessibili da lì. `netlify/lib/feedback-notify.mjs` invia un avviso a `LINEA_FEEDBACK_EMAIL` (facoltativa) con idempotenza `feedback:<conversazione>` per i feedback della chat della home e della chat di prova in dashboard (`kind = test`, con il nome dell'azienda); i feedback dei visitatori sui siti delle aziende restano solo nella loro dashboard. Un errore di invio non blocca il salvataggio.
- Richieste di supporto/attivazione piano: `POST /api/support-request` (`netlify/lib/support-request.mjs`), solo utenti autenticati, anche con Demo scaduta. Destinatario fisso lato server (`LINEA_SUPPORT_EMAIL`, predefinito lorenzoofloridi@gmail.com), `reply_to` = email dell'account, testo in escape, limiti 5/ora per utente e 100/giorno. Sostituisce i link mailto: un solo pulsante che funziona con qualsiasi posta.
- Chat: `interpret` fa al massimo 2 tentativi da 13 s verso Gemini (solo per AI_TIMEOUT, AI_NETWORK, AI_UPSTREAM, AI_RATE_LIMITED), invece di uno da 22 s. Osservati AI_TIMEOUT a ~24 s sul piano gratuito il 25 settembre.
- Dashboard: la chat di prova è ora in fondo alla dashboard (`dashboard-chat.js`, sezione `#prova-ai`); «Prova la tua AI» scorre alla sezione invece di aprire la home con `?azienda=`. L'azienda viene da `/api/me` (sessione), la chat usa le stesse API con isolamento per sessione. Dopo un feedback le statistiche si aggiornano subito. Nessuna recensione nella chat di prova; la vecchia pagina `?azienda=` nasconde comunque le recensioni.

## Aggiornamento 25 settembre 2026 — nuovo nome MoreAI

- Tutti i testi visibili "Linea AI" → "MoreAI" (sito, area riservata, pagine legali, email, prompt dell'assistente della home, traduzioni). Logo "more" + "ai" con marchio «Abbraccio» (M in un cerchio viola con arco sotto, senza puntini); colore principale da blu a viola (conversione automatica di tutte le tinte blu dei CSS e della favicon; i grigi/blu scuri neutri restano).
- Dominio pubblico: www.moreai.it (`PUBLIC_SITE_URL`), mittente email `MoreAI <noreply@moreai.it>` (configurabile con `LINEA_MAIL_FROM`; il dominio deve essere verificato su Resend prima del deploy).
- Invariati per compatibilità (non visibili): repository, progetto Netlify, database, cookie `linea_session`, chiavi del browser `linea.*`, variabili `LINEA_*`.
- Grafica del sito: `outputs/linea-ai-site/dist/moreai.css` (caricato per ultimo in ogni pagina) ed `effects.js` (intestazione e inclinazione delle card, nessun dato). I caratteri sono ospitati in `dist/fonts/` (script `scripts/scarica-font.sh`): nessuna richiesta a Google Fonts.
- Chat AI (`online-ai.mjs`, `chat-state.mjs`): fino a 3 tentativi in 24 s anche per risposte non valide o vuote (modello di riserva facoltativo `LINEA_AI_FALLBACK_MODEL`); ora italiana passata al modello e saluto corretto dal programma; nessun nome o appellativo inventato (`polishReply`); il nome viene salvato solo se compare nel messaggio e non è una frase («non mi chiamo…»); dopo il salvataggio il cliente può correggere i dati già registrati e la richiesta viene aggiornata (`UPDATE leads` filtrato per azienda e conversazione); `close` non chiude se il messaggio contiene una domanda o una correzione; data della preferenza di contatto in formato italiano.
