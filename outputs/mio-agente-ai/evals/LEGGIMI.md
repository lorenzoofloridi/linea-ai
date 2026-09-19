# Valutazione dei modelli

`conversazioni.json` contiene 50 conversazioni sintetiche: dieci tipi di scenario, ciascuno con cinque varianti. Non sono dati di pazienti reali. L'interesse rimane odontoiatrico perché la knowledge base attiva è ancora quella della clinica demo; laser, auto e immobili richiederanno configurazioni aziendali distinte.

`confronta.py` esegue gli stessi messaggi su ciascun modello scelto, con un archivio simulato. Non legge né scrive contatti Google. Il report include:

- versione dei file Python principali e del prompt attraverso un hash;
- messaggi, risposte e stato dopo ogni turno;
- estrazione dei campi attesi, completamento del lead e assenza di duplicati;
- consenso negativo e assenza di scritture in quei casi;
- durata per messaggio e conversazione;
- metriche di generazione e caricamento fornite da Ollama;
- dimensione e memoria del modello riportate da Ollama, non il picco RAM totale del sistema.

Non modificare codice, prompt o configurazione durante un confronto formale. Il primo report pilota è esplorativo e ha guidato correzioni: non va usato come confronto controllato.

Naturalezza, ripetizioni, informazioni inventate, correttezza delle spiegazioni e scelta degli strumenti devono essere revisionate anche da una persona. Un solo caso superato non dimostra che un modello sia migliore. Le risposte preordinate dei casi possono smettere di essere appropriate se il modello cambia direzione: controllare la trascrizione prima di interpretare un fallimento.

Il confronto tra i modelli va eseguito in sequenza per limitare la memoria. Il programma scarica dalla memoria gli altri modelli del confronto; non li elimina dal disco. GPT-OSS riceve un budget di generazione più ampio per consentire la risposta finale; i suoi tempi includono questa elaborazione.

La memoria persistente completa, il RAG, la multi-azienda e gli altri provider non sono coperti da questa suite perché non sono ancora implementati.
