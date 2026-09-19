Specifica completa del progetto — Agente AI commerciale per aziende
1. Obiettivo principale del progetto
Sto costruendo un agente AI commerciale da integrare nel sito web delle aziende.
Non voglio creare semplicemente una chat che risponde alle domande. Voglio creare un assistente commerciale digitale capace di parlare naturalmente con il visitatore del sito, capire cosa vuole, rispondere alle sue domande e, soprattutto, trasformare la conversazione in un lead utile per l'azienda.
Il primo obiettivo concreto è questo:

Cliente entra nel sito
        ↓
parla con l'AI
        ↓
l'AI capisce cosa cerca
        ↓
risponde e conversa naturalmente
        ↓
raccoglie progressivamente:
        │
        ├── nome
        ├── telefono
        ├── trattamento / servizio di interesse
        ├── tempistica
        └── consenso al ricontatto
        ↓
controlla quali informazioni mancano
        ↓
chiede SOLO quelle mancanti
        ↓
verifica di avere il consenso
        ↓
crea il lead
        ↓
salva automaticamente i dati
        ↓
Google Sheets / database
        ↓
AZIENDA

Inizialmente, quindi, l'azienda potrebbe ricevere i lead attraverso un Google Sheet condiviso.
Per esempio:

Nome      Telefono       Interesse          Tempistica        Consenso
Lorenzo   3331234567     Laser gambe        Entro 2 settimane Sì
Marco     3339876543     Trapianto capelli  Entro 3 mesi      Sì
Giulia    3335551234     Filler labbra       Questo mese       Sì

Successivamente il sistema potrà collegarsi direttamente a CRM, calendari, email, WhatsApp e altri software aziendali.

2. L'AI NON deve sembrare un modulo
Questa è una caratteristica fondamentale.
Non voglio una conversazione di questo tipo:
Nome?
Telefono?
Trattamento?
Tempistica?
Consenso?
Quello sarebbe semplicemente un form travestito da chatbot.
L'agente deve invece parlare normalmente con il cliente e capire le informazioni contenute nelle sue frasi.
Per esempio, il cliente potrebbe scrivere:
“Ciao, sono Marco. Vorrei fare un trattamento laser alle gambe verso fine ottobre. Potete chiamarmi al 3331234567?”
L'AI deve automaticamente estrarre:

Nome: Marco
Telefono: 3331234567
Trattamento: laser gambe
Tempistica: fine ottobre
Consenso al ricontatto: NON ANCORA CONFERMATO

A questo punto non deve chiedere nuovamente:
“Come ti chiami?”
oppure:
“Quale trattamento ti interessa?”
oppure:
“Quando vorresti farlo?”
Queste informazioni le possiede già.
Deve capire che manca solamente il consenso e chiedere qualcosa come:
“Perfetto Marco. Posso farla ricontattare dalla struttura al numero che mi ha indicato?”
Se Marco risponde:
“Sì.”
lo stato diventa:

Nome: Marco
Telefono: 3331234567
Trattamento: laser gambe
Tempistica: fine ottobre
Consenso ricontatto: sì

A quel punto il sistema può creare il lead e salvarlo automaticamente nel Google Sheet dell'azienda.

3. Il vero comportamento che voglio ottenere
L'obiettivo tecnico fondamentale è questo:

        CONVERSAZIONE
              ↓
     AI CAPISCE L'UTENTE
              ↓
      ESTRAE INFORMAZIONI
              ↓
       AGGIORNA LO STATO
              ↓
   CONTROLLA COSA GIÀ CONOSCE
              ↓
     CONTROLLA COSA MANCA
              ↓
    ┌─────────┴──────────┐
    ↓                    ↓
MANCA QUALCOSA       TUTTO COMPLETO
    ↓                    ↓
chiede SOLO           crea lead
ciò che manca             ↓
    ↓                Google Sheets
continua chat              ↓
                         AZIENDA

Questo deve funzionare indipendentemente da come il cliente formula la frase.

4. Situazione attuale
Attualmente sto costruendo il progetto in locale su Mac utilizzando:

Python
+
Ollama
+
Llama 3
+
ricerca web
+
memoria temporanea della conversazione

La chat funziona.
Può parlare con l'utente, mantenere una piccola cronologia e fare ricerche online.
Il problema è che il comportamento è ancora troppo meccanico.

5. Problema principale dell'attuale agente
Il programma non comprende ancora sufficientemente l'intento dell'utente per decidere autonomamente cosa fare.
Alcune azioni vengono attivate attraverso parole precise, regex o comandi come:

cerca
notizie
/web

Per esempio, nel codice esiste una logica simile a:

web = bool(re.search(r'\b(cerca|notizie)\b|^/web\b', domanda, re.I))

Questo significa che:

"Cerca le ultime notizie su Apple"

può funzionare.
Ma:

"Che novità ci sono oggi su Apple?"

potrebbe non attivare lo stesso comportamento.
Questo è esattamente ciò che voglio eliminare.
L'agente deve comprendere il significato, non aspettare una determinata parola.
Inoltre attualmente può:

ripetere domande
perdere informazioni precedenti
non ricordare tra sessioni diverse
non sapere esattamente a che punto è la conversazione
non scegliere autonomamente gli strumenti


6. Nuovo modello: GPT-OSS 20B
Come primo miglioramento voglio provare:
Ollama + gpt-oss:20b
senza eliminare inizialmente Llama 3.
Installazione:

ollama pull gpt-oss:20b

Test:

ollama run gpt-oss:20b

Llama 3 deve rimanere installato per permettere un confronto diretto.
Attualmente:

modello='llama3'

potrà diventare:

modello='gpt-oss:20b'

Bisogna confrontare i modelli sulla stessa serie di conversazioni, misurando almeno:

comprensione dell'intento
capacità di estrarre i dati
rispetto del contesto
scelta degli strumenti
qualità delle risposte
allucinazioni
velocità
RAM
stabilità

Il modello migliore deve essere scelto attraverso test, non soltanto attraverso impressioni.

7. GPT-OSS 20B da solo NON risolve il problema
Questo punto è fondamentale.
Cambiare:

Llama 3
↓
GPT-OSS 20B

può migliorare il cervello.
Ma se il programma continua a utilizzare:

regex
if
else
parole chiave

per decidere tutto, continuerà a comportarsi in maniera rigida.
Quindi:

GPT-OSS 20B = cervello migliore

ARCHITETTURA = permette al cervello
di capire, ricordare, decidere e agire

Servono entrambe le cose.

8. Eliminare la dipendenza dalle parole chiave
La decisione di usare Internet o un altro strumento non deve più dipendere da:

if "cerca" in domanda:

oppure regex equivalenti.
Il cliente deve poter dire:

"Che tempo farà domani?"

"Mi trovi qualche informazione su questo trattamento?"

"Quanto costa oggi un iPhone?"

"Ci sono novità?"

"Mi interessa fare il laser."

"Vorrei farlo prima dell'estate."

e l'AI deve comprendere semanticamente cosa significa la frase.

9. Creare il vero "cervello" dell'agente
Prima di rispondere, l'agente deve capire:

Cosa vuole l'utente?

Cosa so già?

Quali dati del lead possiedo?

Quali dati mancano?

Devo rispondere direttamente?

Devo consultare i documenti dell'azienda?

Devo cercare qualcosa online?

Devo utilizzare uno strumento?

Devo creare il lead?

Devo chiedere una sola informazione?

Devo passare la conversazione a un umano?

Il modello può produrre internamente una decisione strutturata.
Per esempio:

{
  "azione": "ricerca_web",
  "query": "prezzo attuale bitcoin"
}

oppure:

{
  "azione": "risposta_diretta"
}

oppure:

{
  "azione": "chiedi_dato_mancante",
  "campo": "telefono"
}

oppure:

{
  "azione": "crea_lead"
}

La decisione deve derivare dal significato della conversazione, non da una regex.

10. Estrattore automatico dei dati del lead
Per il mio prodotto questo componente è prioritario.
Ad ogni messaggio ricevuto, l'AI deve controllare se sono presenti informazioni utili.
Lo stato potrebbe essere:

{
  "nome": null,
  "telefono": null,
  "interesse": null,
  "tempistica": null,
  "consenso_ricontatto": null
}

Il cliente scrive:
“Sono Luca e sarei interessato al laser.”
Diventa:

{
  "nome": "Luca",
  "telefono": null,
  "interesse": "laser",
  "tempistica": null,
  "consenso_ricontatto": null
}

Poi dice:
“Pensavo di farlo entro un mese.”
Lo stato deve diventare:

{
  "nome": "Luca",
  "telefono": null,
  "interesse": "laser",
  "tempistica": "entro un mese",
  "consenso_ricontatto": null
}

L'AI non deve chiedere nuovamente nome, interesse o tempistica.
Deve capire che manca principalmente il contatto.

11. Stato della conversazione
La semplice cronologia dei messaggi non basta.
Serve uno stato strutturato.
Per esempio:

{
  "obiettivo": "generazione_lead",
  "nome": "Luca",
  "telefono": null,
  "trattamento": "laser",
  "tempistica": "entro un mese",
  "consenso_ricontatto": null,
  "lead_completo": false
}

Ogni nuovo messaggio aggiorna questo stato.
Questo evita che l'AI perda il filo della conversazione.

12. Deve chiedere soltanto ciò che manca
Supponiamo che il cliente dica:
“Sono Andrea, vorrei fare il trattamento a novembre e il mio numero è 3331234567.”
Se il trattamento era già stato identificato precedentemente, l'agente potrebbe avere:

Nome            ✅
Telefono        ✅
Trattamento     ✅
Tempistica      ✅
Consenso        ❌

La domanda successiva deve riguardare soltanto il consenso.
Non deve ricominciare il questionario.

13. La conversazione deve rimanere naturale
L'agente non deve ossessionarsi con la raccolta del lead.
Se il cliente domanda:
“Ma il trattamento fa male?”
deve prima rispondere alla domanda utilizzando le informazioni aziendali disponibili.
Poi può continuare naturalmente la conversazione.
L'obiettivo è:

AI utile
+
AI naturale
+
raccolta progressiva del lead

e non:

questionario aggressivo


14. Google Sheets come prima destinazione dei lead
Quando tutti i dati necessari sono disponibili e il consenso è stato ottenuto, il sistema deve utilizzare un tool come:

crea_lead()

che salva:

Nome
Telefono
Trattamento/interesse
Tempistica
Consenso
Data/ora
eventuale origine del lead

nel Google Sheet dell'azienda.
Il modello non deve scrivere direttamente nel foglio.
Il modello decide:

"il lead è completo"

e Python esegue una funzione controllata:

AI
↓
crea_lead()
↓
Google Sheets API
↓
nuova riga
↓
azienda

Questo è il primo vero strumento commerciale del progetto.

15. Evitare lead duplicati
Quando il sistema salva un contatto, deve controllare almeno il numero di telefono.
Se:

3331234567

esiste già, non deve necessariamente creare ogni volta un nuovo cliente.
Potrebbe aggiornare il lead esistente o aggiungere una nuova interazione.
Questo diventerà importante quando il sistema verrà realmente utilizzato.

16. Memoria della conversazione
La memoria attuale vive principalmente nella sessione.
Serve invece una memoria persistente.
Per iniziare si può utilizzare:
SQLite.
Il database dovrebbe progressivamente contenere:

utenti
conversazioni
messaggi
lead
memorie
aziende

In questo modo, chiudere il programma non significa perdere tutto.

17. Non memorizzare tutto indiscriminatamente
L'AI deve distinguere tra:

informazioni importanti

e:

conversazione casuale

Per esempio:

Nome: importante
Telefono: importante
Trattamento: importante
Tempistica: importante
Consenso: fondamentale

Una frase casuale non deve necessariamente diventare memoria permanente.

18. Knowledge Base dell'azienda
Successivamente l'agente deve conoscere realmente l'azienda per cui lavora.
L'azienda deve poter fornire:

FAQ
PDF
prezzi
listini
trattamenti
servizi
cataloghi
orari
condizioni
politiche
manuali
pagine del sito
informazioni interne

Il sistema deve indicizzare queste informazioni e recuperare soltanto quelle pertinenti alla domanda.
Questa è la parte RAG / Knowledge Base.
Esempio:
“Quanto costa il trattamento X?”
L'AI non deve inventare il prezzo.
Deve:

domanda
↓
Knowledge Base aziendale
↓
trova listino
↓
recupera prezzo
↓
GPT formula risposta


19. Distinguere i diversi tipi di informazione
L'agente deve capire autonomamente quale fonte utilizzare.
Per esempio:

"Quanto costa il nostro trattamento laser?"
→ Knowledge Base aziendale


"Che tempo farà domani?"
→ fonte Internet aggiornata


"Quanto fa 17 × 9?"
→ risposta diretta


"Come mi chiamo?"
→ memoria


"Potete ricontattarmi?"
→ sistema lead


20. Tool controllati
Progressivamente l'agente deve poter scegliere strumenti come:

cerca_web()
cerca_documenti()
estrai_dati_lead()
salva_lead()
cerca_cliente()
aggiorna_cliente()
controlla_disponibilita()
crea_appuntamento()
modifica_appuntamento()
invia_email()
apri_ticket()
passa_a_operatore()

L'AI sceglie quale strumento utilizzare.
Python esegue realmente l'operazione.

21. Il modello non deve avere accesso libero al computer
Non voglio:

AI
↓
terminale libero
↓
esegue qualsiasi cosa

Voglio:

AI
↓
sceglie uno strumento autorizzato
↓
Python controlla parametri e permessi
↓
esegue
↓
restituisce risultato all'AI

Questo rende il sistema molto più controllabile e sicuro.

22. Conferma per azioni importanti
Alcune azioni possono essere automatiche.
Per esempio:

consultare documenti
cercare informazioni
controllare disponibilità

Altre possono richiedere conferma:

prenotare
cancellare
inviare determinate comunicazioni
modificare dati importanti
operazioni economiche

In particolare, il consenso al ricontatto non deve essere inventato dal modello: deve derivare da una risposta effettiva del cliente e va registrato in modo appropriato.

23. Separare decisione e risposta
Il flusso non deve essere semplicemente:

utente
↓
GPT
↓
risposta

Deve essere:

messaggio utente
        ↓
estrazione informazioni
        ↓
aggiornamento stato
        ↓
comprensione intento
        ↓
decisione
        ↓
eventuale tool/API
        ↓
risultato
        ↓
generazione risposta naturale

Per esempio:

"Vorrei fare il laser il mese prossimo."
        ↓
INTENTO = interesse commerciale
        ↓
TRATTAMENTO = laser
        ↓
TEMPISTICA = mese prossimo
        ↓
aggiorna stato lead
        ↓
controlla campi mancanti
        ↓
nome e telefono mancanti
        ↓
sceglie la domanda più naturale
        ↓
risponde


24. Gestire correttamente l'ambiguità
L'agente non deve chiedere chiarimenti per ogni minima incertezza.
Se può fare una deduzione ragionevole, deve continuare.
Deve chiedere una domanda soltanto quando l'informazione è davvero necessaria.
Non:

"Non ho capito."

alla minima variazione linguistica.
Piuttosto:

capisci il significato
↓
usa contesto
↓
procedi

Se esistono due interpretazioni importanti, allora può fare una sola domanda mirata.

25. System prompt migliore
Il prompt deve spiegare chiaramente al modello che:

deve capire il significato e non parole precise
deve considerare il contesto
deve riconoscere sinonimi
deve tollerare errori grammaticali
deve tollerare errori di battitura
deve evitare domande già fatte
deve estrarre informazioni spontaneamente
deve chiedere solo ciò che manca
deve utilizzare gli strumenti disponibili
deve parlare naturalmente
non deve inventare informazioni
non deve inventare il consenso


26. Separare il progetto in moduli
Non voglio continuare a mettere tutta la logica dentro agente.py.
Progressivamente il progetto dovrebbe diventare qualcosa del genere:

mio-agente-ai/
│
├── agente.py
│
├── core/
│   ├── brain.py
│   ├── planner.py
│   ├── memory.py
│   ├── state.py
│   ├── lead_manager.py
│   └── prompts.py
│
├── tools/
│   ├── web_search.py
│   ├── knowledge.py
│   ├── google_sheets.py
│   ├── customers.py
│   ├── calendar.py
│   ├── email.py
│   └── handoff.py
│
├── providers/
│   ├── ollama_provider.py
│   ├── openai_provider.py
│   └── anthropic_provider.py
│
├── data/
│   └── agente.db
│
├── knowledge/
│
├── tests/
│
├── requirements.txt
│
└── Avvia.command


27. Rendere intercambiabile il modello AI
Il resto del sistema non deve dipendere direttamente da Ollama.
Idealmente:

risposta = llm.chat(messages)

e llm potrebbe essere:

GPT-OSS tramite Ollama
Llama tramite Ollama
OpenAI
Anthropic
altro provider

Quindi:

                AGENTE
                   ↓
              LLM ROUTER
        ┌──────────┼──────────┐
        ↓          ↓          ↓
      Ollama     OpenAI    Anthropic
        ↓
   GPT-OSS 20B

Oggi posso sviluppare localmente senza costo API.
Domani posso offrire eventualmente un modello cloud più potente senza riscrivere l'intero prodotto.

28. Parametri diversi per compiti diversi
Il planner e l'estrazione dei dati devono essere relativamente deterministici.
Non voglio che:

stessa frase
↓
una volta estrae telefono
↓
un'altra volta no

La generazione della risposta può invece essere un po' più naturale.
Aumentare semplicemente la temperatura non significa rendere l'agente più intelligente.

29. Sistema di fallback
Se qualcosa fallisce, l'agente non deve rompersi.
Per esempio:

Google Sheets non disponibile
↓
salva temporaneamente il lead nel database
↓
registra errore
↓
ritenta / segnala il problema

Oppure:

ricerca Internet fallisce
↓
non inventare
↓
spiegare che il dato aggiornato non è disponibile

Se il modello restituisce dati strutturati non validi, Python deve validarli e gestire l'errore.

30. Test seri
Prima di aggiungere continuamente nuove funzionalità bisogna costruire una suite di test.
Per il mio caso sono particolarmente importanti frasi come:

"Mi chiamo Marco."

"Sono Marco."

"Marco, piacere."

"Puoi chiamarmi Marco."

Devono tutte permettere di riconoscere correttamente il nome quando il contesto lo consente.
E:

"Vorrei fare il laser."

"Sono interessato alla depilazione."

"Mi interessano le gambe."

"Stavo pensando al trattamento laser alle gambe."

devono essere comprese semanticamente.
Bisogna preparare almeno 50-100 conversazioni realistiche, comprese quelle difficili.

31. Testare conversazioni complete, non soltanto singole frasi
Questo è particolarmente importante per il mio prodotto.
Esempio:

AI: Come posso aiutarti?

Cliente:
Vorrei informazioni sul laser.

AI:
[risponde]

Cliente:
Pensavo di farlo prima dell'estate.

AI:
[deve ricordare laser]

Cliente:
Comunque sono Luca.

AI:
[deve ricordare Luca]

Cliente:
Il mio numero è 3331234567.

AI:
[deve ricordare tutto]

Cliente:
Va bene, potete chiamarmi.

AI:
[deve riconoscere il consenso]

Risultato:

Nome: Luca
Telefono: 3331234567
Interesse: laser
Tempistica: prima dell'estate
Consenso: sì

→ lead salvato.
Questo test è molto più importante di verificare soltanto se l'AI sa rispondere a domande generiche.

32. Logging e osservabilità
Ogni conversazione dovrebbe permettere agli sviluppatori di capire cosa è successo.
Per esempio:

Messaggio ricevuto
↓
Intento: richiesta trattamento
↓
Dati estratti:
trattamento = laser
tempistica = maggio
↓
Stato aggiornato
↓
Campi mancanti:
nome
telefono
consenso
↓
Azione:
continua conversazione
↓
Risposta generata

Quando qualcosa non funziona, questo permette di capire perché.

33. FastAPI
Quando il cervello funziona bene localmente, il programma deve smettere di essere soltanto una chat da Terminale.
Bisogna creare un backend con FastAPI.
Per esempio:

POST /chat
POST /leads
GET  /conversations
POST /documents
GET  /customers

In questo modo:

sito
WhatsApp
dashboard
altre applicazioni

possono parlare tutte con lo stesso motore AI.

34. Webchat: priorità alta
Nel mio caso la webchat viene prima di WhatsApp, perché il prodotto iniziale deve essere installato sul sito dell'azienda.
Architettura:

VISITATORE
     ↓
SITO AZIENDALE
     ↓
WIDGET CHAT
     ↓
FASTAPI
     ↓
AGENTE AI
     ↓
MEMORIA + STATO + KNOWLEDGE + TOOLS
     ↓
RISPOSTA

Il widget deve poter essere inserito facilmente nei siti dei clienti.

35. Prima versione commerciale
La prima versione vendibile non ha bisogno di fare tutto.
Deve fare molto bene:

WEBCHAT
   +
CONVERSAZIONE NATURALE
   +
CONOSCENZA AZIENDA
   +
ESTRAZIONE LEAD
   +
MEMORIA/STATO
   +
CONSENSO
   +
GOOGLE SHEETS

Questo è già un prodotto concreto.

36. Dashboard aziendale
Successivamente l'azienda dovrebbe avere una dashboard in cui vedere:

nuovi lead
conversazioni
nome cliente
telefono
interesse
tempistica
consenso
stato lead
domande frequenti
conversazioni non risolte
eventuali richieste di operatore

In futuro anche:

appuntamenti
conversioni
performance AI
analytics


37. Human handoff
L'AI deve sapere quando fermarsi e coinvolgere una persona.
Per esempio:

cliente chiede esplicitamente un umano
cliente molto insoddisfatto
domanda che l'AI non può gestire
situazione delicata
AI non possiede informazioni sufficienti

Flusso:

AI
↓
passa_a_operatore()
↓
operatore riceve:
- cliente
- dati raccolti
- cronologia
- riepilogo
↓
operatore continua

Il cliente non dovrebbe essere costretto a raccontare tutto da capo.

38. WhatsApp in una fase successiva
Quando il sistema funziona bene sulla webchat:

Cliente WhatsApp
       ↓
WhatsApp Business API
       ↓
FastAPI
       ↓
stesso motore agente
       ↓
memoria / knowledge / tools
       ↓
risposta
       ↓
WhatsApp

Non bisogna costruire una seconda AI per WhatsApp.
WhatsApp è semplicemente un altro canale.

39. Altri canali
Successivamente:

Webchat ──────┐
WhatsApp ─────┤
Instagram ────┤
Email ────────┼→ MOTORE AI UNICO
Voce ─────────┤
              ↓
      memoria / tools / CRM

Il cervello centrale rimane lo stesso.

40. Calendario e prenotazioni
Dopo che la generazione lead funziona bene, l'agente potrà anche trasformare il lead direttamente in appuntamento.
Per esempio:
“Vorrei venire venerdì pomeriggio.”
L'AI:

capisce la richiesta
↓
controlla calendario
↓
trova disponibilità
↓
propone orari
↓
cliente sceglie
↓
conferma
↓
crea appuntamento

Questa è una fase successiva, non la priorità iniziale.

41. CRM
In futuro Google Sheets potrà essere sostituito o affiancato da:

CRM
database interno
software gestionale dell'azienda

L'architettura deve quindi essere:

AI
↓
crea_lead()
↓
DESTINAZIONE CONFIGURABILE
├── Google Sheets
├── CRM
├── database
└── altro gestionale

Così la logica conversazionale non cambia.

42. Architettura multi-azienda
Per poter vendere il prodotto a molte aziende serve una separazione completa.
Ogni dato deve essere associato a qualcosa come:

company_id

Esempio:

AZIENDA A
├── documenti A
├── lead A
├── clienti A
├── conversazioni A
├── Google Sheet A
└── configurazione A


AZIENDA B
├── documenti B
├── lead B
├── clienti B
├── conversazioni B
├── Google Sheet B
└── configurazione B

I dati delle due aziende non devono mai mischiarsi.

43. Personalizzazione per ogni azienda
Ogni azienda dovrebbe poter configurare:

nome dell'assistente
tono di voce
servizi
trattamenti
prezzi
FAQ
orari
dati da raccogliere
regole
consensi
Google Sheet / CRM
quando coinvolgere un operatore
modello AI

Questo è fondamentale per trasformare il progetto in un prodotto vendibile.

44. I campi del lead devono diventare configurabili
All'inizio utilizzerò:

nome
telefono
trattamento
tempistica
consenso

Ma non tutte le aziende hanno bisogno degli stessi dati.
Per esempio, un concessionario potrebbe volere:

nome
telefono
modello automobile
budget
tempistica acquisto
consenso

Un'agenzia immobiliare:

nome
telefono
zona
budget
tipologia immobile
tempistica
consenso

Quindi in futuro non bisogna scrivere nel codice:

campi = ["nome", "telefono", "trattamento"]

come regola universale.
Ogni azienda deve poter definire quali informazioni vuole raccogliere.
Questa è una caratteristica molto importante per rendere il prodotto generalizzabile.

45. Database
Per sviluppo:

SQLite

va benissimo.
Quando il prodotto inizierà a gestire più aziende e utenti contemporaneamente:

PostgreSQL

sarà una scelta più appropriata.

46. Docker e server
Docker non è la priorità immediata.
Prima:

AI locale stabile
↓
estrazione lead
↓
memoria
↓
Knowledge Base
↓
Google Sheets
↓
FastAPI
↓
webchat

Poi:

Docker
↓
server
↓
produzione

L'ASUS potrà essere valutato come primo server soltanto dopo aver verificato hardware, prestazioni, affidabilità della connessione e requisiti del modello.

47. Autenticazione e permessi
Un prodotto commerciale deve distinguere almeno:

amministratore piattaforma
azienda
operatore
cliente finale

Ogni azienda deve accedere esclusivamente ai propri dati.

48. Privacy, sicurezza e consenso
Questo punto è particolarmente importante perché il progetto raccoglierà:

nome
numero di telefono
interessi
conversazioni
consenso

e potenzialmente altre informazioni personali.
Bisognerà quindi affrontare seriamente:

GDPR
informativa privacy
consenso
retention
cancellazione dati
sicurezza database
HTTPS
protezione API key
controllo accessi
log
fornitori esterni

Le API key non devono essere scritte direttamente nel codice sorgente.
E il consenso non deve essere dedotto arbitrariamente dall'AI.

49. Analytics
Successivamente bisogna poter misurare:

visitatori che aprono la chat
conversazioni iniziate
lead raccolti
lead completi
consensi ottenuti
conversion rate
trattamenti più richiesti
tempo medio conversazione
handoff a operatori
errori dell'AI
appuntamenti generati

Per l'azienda il valore del prodotto sarà anche dimostrato da numeri come:

1.000 conversazioni
↓
320 potenziali clienti
↓
180 lead completi
↓
70 appuntamenti
↓
X € di vendite


50. Valutazione continua
Ogni modifica al:

modello
prompt
planner
RAG
memoria
tool

deve essere confrontata con la suite di test.
Non basta dire:
“Adesso sembra più intelligente.”
Bisogna poter verificare che sia realmente migliorato.

51. Funzioni avanzate future
Solo quando il nucleo funziona bene si potranno aggiungere:

prenotazioni
follow-up automatici
WhatsApp
email
CRM
classificazione lead
lead scoring
riepiloghi per operatori
analisi sentiment
suggerimenti commerciali
ticket
voice agent
workflow complessi


52. Architettura finale desiderata
Non voglio più:

UTENTE
   ↓
REGEX
   ↓
IF / ELSE
   ↓
LLAMA
   ↓
RISPOSTA

Voglio arrivare progressivamente a:

                       CLIENTE
                          ↓
                 SITO / WHATSAPP
                          ↓
                       FASTAPI
                          ↓
                    MOTORE AGENTE
                          │
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
      STATO            MEMORIA          KNOWLEDGE
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ↓
                     AI / PLANNER
                     GPT-OSS 20B
                          ↓
                   DECIDE COSA FARE
                          ↓
      ┌───────────────┬───┴────┬───────────────┐
      ↓               ↓        ↓               ↓
   DOCUMENTI          WEB     LEAD          CALENDARIO
                               ↓
                       GOOGLE SHEETS
                               ↓
                            AZIENDA

Successivamente:

                         AI / PLANNER
                              ↓
      ┌──────────┬────────────┼──────────┬──────────┐
      ↓          ↓            ↓          ↓          ↓
     RAG        WEB       GOOGLE SHEETS CRM     CALENDARIO
                                                   ↓
                                             APPUNTAMENTO


53. La priorità reale del progetto
Non devo cercare di costruire immediatamente un clone completo di Keplero, Spoki o Fin.
Devo prima costruire una funzione commerciale molto precisa e farla funzionare estremamente bene.
La mia V2 deve concentrarsi su:

GPT-OSS 20B
        +
CHAT NATURALE
        +
COMPRENSIONE SEMANTICA
        +
ESTRAZIONE AUTOMATICA DEI DATI
        +
STATO DEL LEAD
        +
MEMORIA DELLA CONVERSAZIONE
        +
CHIEDE SOLO I DATI MANCANTI
        +
CONSENSO
        +
GOOGLE SHEETS

Questo è il primo grande traguardo.

54. Esempio della V2 ideale
Un cliente entra sul sito di una clinica.
Cliente:
“Ciao, volevo qualche informazione sul laser.”
L'agente capisce:

Interesse: laser

e risponde normalmente alle sue domande.
Successivamente:
Cliente:
“Sì, mi interessano soprattutto le gambe. Pensavo magari il mese prossimo.”
L'agente aggiorna:

Trattamento: laser gambe
Tempistica: mese prossimo

Poi durante la conversazione:
Cliente:
“Comunque sono Giulia.”
Aggiorna:

Nome: Giulia

Successivamente:
Cliente:
“Se volete potete chiamarmi al 3331234567.”
L'agente estrae:

Telefono: 3331234567

e gestisce correttamente il consenso al ricontatto, chiedendo conferma se necessario secondo il flusso definito.
Alla fine:

Nome: Giulia
Telefono: 3331234567
Trattamento: laser gambe
Tempistica: mese prossimo
Consenso: sì

Il sistema esegue:

crea_lead()
↓
Google Sheets
↓
nuova riga
↓
azienda riceve il contatto

Questo è il comportamento che deve funzionare prima di aggiungere decine di altre funzionalità.

55. Evoluzione del progetto
La roadmap, vista in modo molto semplice, è:

V1 — QUELLA ATTUALE
Llama 3
+
chat terminale
+
piccola memoria
+
ricerca web

↓

V2 — PRIORITÀ ATTUALE
GPT-OSS 20B
+
chat molto più naturale
+
comprensione dell'intento
+
estrazione lead
+
stato conversazione
+
memoria migliore
+
Google Sheets

↓

V3
SQLite
+
memoria persistente
+
Knowledge Base / RAG
+
informazioni reali dell'azienda

↓

V4
FastAPI
+
webchat vera
+
widget installabile sul sito

↓

V5
dashboard aziendale
+
gestione lead
+
human handoff
+
analytics

↓

V6
WhatsApp
+
CRM
+
calendario
+
appuntamenti
+
email

↓

V7
multi-azienda
+
PostgreSQL
+
autenticazione
+
configurazioni per cliente
+
infrastruttura di produzione

↓

V8
piattaforma commerciale completa
+
più modelli AI
+
voice agent
+
automazioni
+
lead scoring
+
workflow avanzati


56. In una frase: che cosa sto costruendo?
Sto costruendo un agente AI commerciale installabile sul sito di un'azienda, capace di conversare naturalmente con i visitatori, comprendere le loro esigenze, rispondere usando le informazioni reali dell'azienda, raccogliere automaticamente i dati necessari senza sembrare un questionario, ottenere il consenso al ricontatto e trasformare la conversazione in un lead strutturato da inviare automaticamente all'azienda, inizialmente tramite Google Sheets e successivamente tramite CRM e altri strumenti.
E il principio fondamentale dell'intero progetto è:

NON COSTRUIRE SOLO UN'AI CHE PARLA.

COSTRUIRE UN'AI CHE:

CAPISCE
   ↓
RICORDA
   ↓
RACCOGLIE
   ↓
DECIDE
   ↓
USA STRUMENTI
   ↓
SALVA IL LEAD
   ↓
AIUTA L'AZIENDA A CONVERTIRE IL CLIENTE

Questa è la specifica che darei a uno sviluppatore per spiegargli sia cosa vuoi costruire, sia in quale ordine costruirlo.
