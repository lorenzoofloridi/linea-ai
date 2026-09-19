# Conversazione autonoma

Il modello sceglie se rispondere, chiarire, chiedere un dato effettivamente mancante o proporre la conferma. Non c’è più una sequenza obbligatoria di domande né un passaggio obbligatorio per scegliere visita o ricontatto.

Le informazioni sono estratte anche quando la stessa frase contiene una domanda. Le correzioni aggiornano i dati e invalidano il consenso precedente. Il programma conserva i dati acquisiti separatamente dalla cronologia recente.

La domanda di consenso e la ricevuta rimangono controllate dal programma. Formulazioni usuali equivalenti sono riconosciute immediatamente; altre formulazioni sono verificate semanticamente nel contesto della domanda precedente. Dubbi, condizioni e correzioni non costituiscono un’autorizzazione automatica. Dopo un errore di scrittura non viene effettuato un secondo invio alla cieca.

Sul sito, inizia una nuova conversazione per caricare il motore aggiornato. Nel Terminale chiudi e riapri Avvia.command. Il prompt viene letto durante la generazione delle risposte.

I test in tests/test_autonomia.py verificano i controlli del programma usando conversazioni simulate, senza scrivere nel foglio. Non dimostrano che il modello comprenda ogni possibile frase: le risposte del modello richiedono anche prove reali e restano suscettibili di errore.


## Preferenza per il ricontatto

La tempistica è la preferenza per essere richiamati dalla segreteria, non la data della visita. L’indecisione alla domanda sul ricontatto può essere registrata come “Da concordare”. Nessuna data viene garantita. Il riepilogo etichetta esplicitamente questa preferenza.

Il trattamento viene ripulito dai caratteri accidentali periferici; i telefoni restano invariati. Una domanda che chiede insieme nome e numero viene respinta anche se contiene un solo punto interrogativo.

Gli errori di salvataggio vengono comunicati senza dettagli tecnici al paziente. La diagnostica locale registra soltanto data, classe di errore e stato HTTP, senza dati del contatto o credenziali.
