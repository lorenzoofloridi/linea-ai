# Qwen 2.5 7B e Qwen3 14B — confronto nella demo

Stato: completati 10 dialoghi per ciascun modello. Decisione per questa demo: mantenere Qwen 2.5 7B per il migliore compromesso operativo sul Mac. Qwen3 ha compreso meglio alcuni casi, ma è risultato sensibilmente più lento e ha avuto ripetuti errori in un dialogo. Non è una classifica universale dei modelli.

| Misura | Qwen 2.5 7B | Qwen3 14B, think=false |
|---|---:|---:|
| Casi che superano tutti i controlli operativi | 8/10 | 9/10 |
| Richieste completate nei sette casi previsti | 5/7 | 7/7 |
| Mediana dei tempi per messaggi elaborati | 32,4 s | 79,9 s |
| Durata totale dei dieci dialoghi | 969 s | 2149,5 s |

La mediana esclude passaggi inferiori a 0,1 secondi, come alcune conferme e riepiloghi gestiti direttamente dal programma; include l'attesa dei passaggi falliti. Nessuna scrittura non autorizzata rilevata nei tre scenari senza consenso per entrambi i modelli. Questo non significa che tutti e tre siano stati gestiti bene: Qwen3 nel caso non_inventare ha restituito più errori di elaborazione e non acquisito il nome.

Qwen3 ha risolto la domanda mista sui costi e “anche adesso”, dove Qwen 2.5 non aveva completato la richiesta. Ha inoltre risposto in modo più pertinente al consenso subordinato a un prezzo, senza salvare. Restano però ripetizioni, domande premature sulla telefonata ed emoji non necessarie. Qwen 2.5 resta da migliorare: nessuno dei due è stato certificato come pronto per un servizio pubblico.

## Metodo

Dieci conversazioni identiche, una per scenario, eseguite sullo stesso assistente. Archivio simulato: nessun lead scritto su Google Sheets. Modelli caricati uno alla volta. Qwen3 usa `think=false`, come configurazione candidata per chat interattiva; non sono misurate le sue prestazioni con ragionamento esteso. Le risposte includono sia testo del modello sia controlli e riepiloghi del programma: si valuta il sistema completo con quel modello.

I controlli automatici verificano alcuni dati attesi, completamento quando previsto, assenza di duplicati e assenza di scrittura nei tre scenari senza consenso. Non certificano la correttezza di ogni frase. I dialoghi sono anche letti per ripetizioni, promesse, naturalezza e risposte alle domande. I messaggi del cliente sono fissi: non simulano ogni possibile adattamento umano a una risposta imprevista.

Qwen 2.5 è stato eseguito durante il download di Qwen3; Qwen3 in seguito. Tempi e stato del Mac possono variare, e non sono state eseguite ripetizioni statistiche. Il confronto è tra 7B e 14B, quindi cambiano sia generazione sia dimensione. La memoria riportata è quella del modello secondo Ollama, non il picco totale del sistema.

## Primo risultato Qwen 2.5

8/10 casi superano i controlli operativi: cinque richieste completate su sette previste, nessuna scrittura nei tre casi senza consenso. Non conclude i casi domanda mista con prezzo e tempistica “anche adesso”. Alcune risposte si attribuiscono il contatto con il paziente o parlano di programmi dello studio non verificati. Altre sono eccessivamente entusiaste o ripetitive. Questi difetti non vengono annullati dal superamento dei controlli sui dati.

## Vecchio confronto con Llama e GPT-OSS

Nel singolo caso dati insieme, Qwen 2.5 e GPT-OSS avevano estratto i dati e completato la richiesta. Il riepilogo identico era composto dal programma: non misura una superiorità nello stile del modello. Llama 3 aveva fallito l'estrazione e dato una risposta fuori contesto. Non esiste una valutazione ampia della qualità conversazionale di GPT-OSS in questo progetto.

Fonte della modalità Qwen3: https://docs.ollama.com/capabilities/thinking
