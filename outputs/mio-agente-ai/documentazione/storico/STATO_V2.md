# V2 — stato del lavoro

La specifica integrale è in SPECIFICA_PROGETTO.md. È una roadmap progressiva, non una descrizione delle funzioni già disponibili.

## Implementato

- Demo web e Terminale utilizzano il motore commerciale condiviso.
- Stato strutturato della richiesta, dati spontanei, consenso e salvataggio controllato.
- Date di contatto ancorate al fuso Europe/Rome; espressioni non risolvibili conservate con data di riferimento.
- Riepilogo basato sulla registrazione confermata, aggiornamento delle richieste aggiuntive sulla stessa riga, senza nuovi lead duplicati nella sessione.
- Registro SQLite delle consegne autorizzate: conserva dati del lead, prova del consenso, data, origine ed esito, senza memorizzare tutta la chat.
- Provider Ollama separato in providers/ollama_provider.py. Configurazione del modello in config/modello.json; nessun cambio automatico al candidato prima della valutazione.
- Planner semantico per decidere la ricerca nell'assistente generale: non dipende più dalle parole “cerca” e “notizie”. Non è ancora un motore RAG aziendale e non è attivato nella demo commerciale.
- Significato della tempistica configurabile per la demo nel motore: contatto (impostazione attuale) o trattamento. Il selettore web attuale riguarda il contatto.
- 50 conversazioni di valutazione, in dieci tipi di scenario con cinque varianti. Esecuzione e revisione umana ancora da completare; non sono 50 test già superati.

## Verifiche

I test automatici dei controlli del programma non misurano da soli la qualità del modello. Il confronto in evals/confronta.py usa un archivio simulato: non può creare righe su Google Sheets. Produce i dati acquisiti, le risposte, il numero di scritture simulate, tempi e metriche di Ollama. Le misure size/size_vram del modello non sono una misura completa del picco RAM del Mac.

Naturalezza, allucinazioni e opportunità delle domande richiedono revisione dei dialoghi. Un confronto su un sottoinsieme è un pilota e non giustifica una scelta definitiva.

## Ancora da realizzare

- Completare il confronto tra GPT-OSS 20B, Llama 3 e Qwen con le stesse conversazioni, incluse prestazioni sotto carico e memoria complessiva.
- Separare ulteriormente planner, stato e lead manager del motore commerciale; ridurre gli errori misurati prima di aggiungere strumenti.
- Estendere il registro locale delle consegne (ora implementato per lead autorizzati) a memoria persistente selettiva e riconciliazione idempotente. Non sono attivi retry automatici: una consegna incerta richiede verifica.
- Deduplicazione tra sessioni sul telefono e company_id. Attualmente la protezione dai duplicati è limitata alla sessione; non è un sistema multi-azienda.
- Knowledge Base verificata, FastAPI, widget incorporabile, permessi e accesso privato per amici/aziende.
- Provider cloud, CRM, WhatsApp, calendario, dashboard e analytics: non ancora implementati.

Le credenziali e gli archivi personali rimangono fuori dalla cartella pubblica del sito. La documentazione privacy dovrà essere aggiornata prima di attivare memoria persistente o nuove destinazioni dei dati.

## Modelli

La configurazione corrente conserva Qwen 2.5 7B. Il candidato richiesto è gpt-oss:20b; nessun modello esistente viene eliminato. Il Mac verificato dispone di 16 GiB di RAM: prima della prova del candidato vanno scaricati dalla memoria gli altri modelli, senza eliminarli dal disco.

Riferimento ufficiale: https://developers.openai.com/api/docs/models/gpt-oss-20b

## Verifica del 12 settembre

GPT-OSS 20B installato senza eliminare i modelli esistenti. Completato un confronto pilota su un caso con Qwen, Llama e GPT-OSS; Qwen resta attivo per la demo. Vedi evals/RISULTATI.md per esiti e limiti. Verificata anche la conversazione post-salvataggio con Qwen e archivio simulato. La suite completa e le restanti fasi della roadmap non sono concluse.

Il sito si avvia dal file “Apri il sito.command” nella cartella principale; la condivisione esterna non è attiva.

## Pulizia modelli richiesta dall’utente — 12 settembre

Rimossi da Ollama gpt-oss:20b e llama3 per liberare spazio. Rimane qwen2.5:7b, condiviso anche dall’assistente generale. Qwen3 14B non è installato né valutato. I risultati precedenti sono conservati come storico; per ripetere quei confronti occorrerebbe reinstallare i modelli rimossi. La prova pilota riguarda velocità ed estrazione nel caso provato, non una superiorità generale di Qwen.

## Decisione del 13 settembre

Completati dieci dialoghi identici con Qwen 2.5 7B e Qwen3 14B. Qwen3 migliora alcuni casi di comprensione, ma la latenza mediana osservata è 79,9 secondi contro 32,4 e un dialogo presenta ripetuti errori. Per richiesta dell’utente viene conservato solo Qwen 2.5 7B come compromesso operativo sul Mac. Il confronto completo delle 50 conversazioni resta distinto da questa prova su dieci casi. Risultati e limiti in evals/CONFRONTO_QWEN.md.
