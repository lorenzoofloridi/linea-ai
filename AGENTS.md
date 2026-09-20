# Manutenzione del progetto

La guida principale è outputs/mio-agente-ai/README.md (dalla radice del progetto).
Prima di modificare il prodotto, leggere la guida e verificare i file effettivi interessati.
Dopo ogni aggiornamento significativo, verificare il README e aggiornare soltanto le sezioni divenute inesatte: funzionalità, struttura, frontend/backend, autenticazione, dashboard, lead, AI, schema/migrazioni, dipendenze, variabili d’ambiente realmente lette, servizi, installazione, configurazione, avvio, test, limiti e lavoro futuro.
Non inserire note generiche di aggiornamento, informazioni ipotetiche, credenziali o dati reali. Non riscrivere i rapporti storici come se descrivessero la versione corrente.
Mantenere il sito locale: non pubblicare o attivare tunnel senza richiesta esplicita.
Preservare archivi e segreti; aggiornare tutti i riferimenti quando si spostano file. Eseguire i controlli proporzionati; non usare i dati reali per i test. Rigenerare la consegna sorgenti con prepara-consegna.py quando cambia il materiale consegnabile.

Mantenere anche DA-COMPLETARE.txt nella radice del progetto: per ogni attività non conclusa aggiornare una sola voce con stato e motivo verificato, senza duplicati. Rimuovere o segnare risolti i limiti superati dopo verifica.

La cartella operativa unica è Documenti/GitHub/linea-ai. Non modificare la precedente copia Desktop. Dopo modifiche verificare test, documentazione e diff prima del commit; aprire/aggiornare GitHub Desktop sul repository corretto. Il ramo main è la versione ufficiale. Integrare le modifiche preservando quelle esistenti, verificare test e assenza di segreti prima del push. L’invio a GitHub è autorizzato senza deployment: controllare che non attivi pubblicazioni automatiche. Non includere dati o segreti.
