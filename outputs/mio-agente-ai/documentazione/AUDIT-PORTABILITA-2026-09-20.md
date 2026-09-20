# Audit locale prima delle modifiche — 20 settembre 2026

Esaminati README, registro DA-COMPLETARE, inventario di tutti i file esclusi ambiente e backup, import Python, schema SQLite, avvii, provider, API e suite esistenti. Baseline: 84 test passati, controllo HTTP passato, quick_check SQLite ok. Non effettuata una nuova valutazione qualitativa completa del modello o prova su Windows/Linux.

| Componente | Stato osservato | Evidenza / limite |
|---|---|---|
| Account, sessioni, password, multi-azienda | Funzionante locale | store/api e test di isolamento; nessuna verifica email reale |
| Dashboard, lead, conversazioni, export Excel | Funzionante locale | API e test funzionali; Excel tronca celle oltre limite formato |
| Knowledge pubblica/privata e versioni | Funzionante locale/parziale | snapshot e approvazione; import da testo/fixture, non crawler |
| AI e modello | Ollama locale | provider via HTTP standard, modello in config; qualità/velocità non garantite |
| Branding, scoring, reparti | Locale | policy/hybrid, scoring deterministico; dominio/email non configurati |
| Voce, CRM, WhatsApp, prenotazioni | Mock | adapters e test; niente servizi esterni reali |
| Handoff | Parziale locale | cronologia e stati; niente push/presenza |
| Email/reset | Parziale | coda e messaggio privato locale, SMTP non configurato |
| Piani/portafoglio | Simulazione locale | subscriptions; nessun addebito reale |
| Recensioni, cookie e lingue | Parziale locale | moderazione CLI e test; localizzazione non completa |
| Database | SQLite, 33 tabelle | integrità verificata, percorsi relativi ai sorgenti; schema additivo |
| Avvio | Prima solo Mac | launcher zsh/open; mancavano avvii Windows/Linux |
| Dipendenze sito | phonenumbers + fusi orari | provider Ollama usa urllib, non SDK; Windows necessita tzdata |
| Dipendenze storiche | Freeze completo | requirements conserva Google/DDGS/Ollama; separare dal runtime essenziale |
| Test | 84 + smoke HTTP | usano sys.executable e archivi temporanei, riutilizzabili su OS diversi |
| Sicurezza file Windows | Da verificare su OS reale | chmod non sostituisce ACL Windows; directory privata da proteggere |
| Backup | Snapshot verificato creato | 216 file, 3 copie SQLite consistenti, SHA-256; esclusi venv/cache/backup precedenti |

Snapshot iniziale privato: outputs/linea-ai-site/private-data/backups/portability-20260920 (snapshot.zip e manifest.json). Contiene anche dati/credenziali: non incluso nella consegna, non da condividere. Le copie SQLite usano l’API backup; hash e integrità verificati. L’ambiente .venv e i pesi Ollama non ne fanno parte.

Intervento approvato: installatore e avvio portabili, dipendenze runtime bloccate con hash, fusi orari inclusi, verifica in nuova .venv e copia sorgenti indipendente. Nessuna riscrittura di AI, database o autenticazione; nessuna pubblicazione.

## Esito dopo l’intervento

- Lock runtime con versioni e hash delle wheel universali phonenumbers 9.0.39 e tzdata 2026.4, scaricate e installate correttamente.
- Ambiente pulito separato: 87 test + controllo HTTP completi passati, pip check senza conflitti.
- Consegna estratta in altra directory con spazi/accenti, .venv ricreata con le sole due dipendenze: stessi 87 test e flusso HTTP passati. Nessun accesso ai dati della cartella operativa.
- Test timezone con database OS disabilitato, selezione percorsi Windows/POSIX e rilevamento snapshot alterato passati.
- Snapshot originale riletto e verificato: 216 hash corrispondenti.
- Intervento non ha modificato schema, dati aziendali o comportamento AI. Aggiunto tzdata nell’ambiente operativo; librerie storiche conservate.
- Non eseguiti test nativi Windows/Linux né nuova inferenza reale del modello: il motore non è stato modificato.
