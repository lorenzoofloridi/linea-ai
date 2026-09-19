# Confronto iniziale — risultato parziale

Un solo caso identico: dati spontanei nello stesso messaggio, poi consenso. Nessuna scrittura reale su Google Sheets.

| Modello | Durata totale | Lead completato | Dati attesi |
|---|---:|---|---|
| qwen2.5:7b | 16.3 s | Sì | 3/3 |
| llama3 | 72.5 s | No | 0/3 |
| gpt-oss:20b | 150.9 s | Sì | 3/3 |

GPT-OSS 20B installato e valutato il 12 settembre. Circa 65.7 secondi di caricamento, 22.8 di elaborazione del prompt e 59.6 di generazione nella chiamata misurata. Memoria del modello riportata da Ollama: circa 13.97 GB. Le prove sono avvenute in momenti diversi; non sono un benchmark controllato a modello già caldo. Qwen rimane il modello della demo.

Le date relative dipendono dal giorno di esecuzione: nel test del 12 settembre “domani” è diventato 13/09/2026. Il file vuoto del confronto GPT del giorno precedente appartiene alla prova interrotta e non costituisce un risultato.

Questi risultati non rappresentano la suite completa, non misurano tutte le allucinazioni e non autorizzano una conclusione generale sul modello migliore. La RAM indicata nei report JSON è la memoria del modello riportata da Ollama, non il picco totale del Mac.

## Conversazione dopo il salvataggio — Qwen

Verificata sul modello reale con archivio simulato: domanda sul pagamento → proposta di aggiunta → “Ok” → un solo aggiornamento; domanda “cosa hai salvato?” → riepilogo completo; “Va bene, grazie” → risposta naturale. Entrambe le esecuzioni sono terminate con una sola modifica. Dopo la riduzione delle istruzioni per i saluti, l'ultimo passaggio ha richiesto 15.91 secondi contro 29.03 nella prima esecuzione. Sono misure singole a condizioni variabili, non una garanzia di latenza.

25 test automatici del programma superati. Le 50 conversazioni sono predisposte, ma il confronto completo e la revisione della naturalezza restano da eseguire.
