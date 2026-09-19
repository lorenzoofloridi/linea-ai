'use strict';
(()=>{
const specific={
'Richieste da gestire':'Apri un contatto per leggere i dati raccolti e la conversazione. Puoi aggiornare lo stato mentre il team gestisce la richiesta.',
'Conversazioni della tua azienda':'Qui trovi anche i dialoghi che non hanno ancora generato un contatto. Ogni conversazione appartiene soltanto alla tua azienda.',
'La tua azienda':'Raccoglie informazioni, fonti, installazioni e valutazioni relative alla tua azienda.',
'Statistiche complessive':'Mostra il numero di conversazioni e richieste e le valutazioni ricevute. Una richiesta non equivale a una vendita.',
'Informazioni e fonti':'Le informazioni in bozza non entrano nella conoscenza dell’assistente finché non vengono verificate e autorizzate.',
'Installazioni':'Elenca i collegamenti della chat alla tua azienda. Questa anteprima resta locale: non installa nulla sui siti esterni.',
'Feedback dei visitatori':'Valutazioni facoltative lasciate dalle persone che hanno provato la chat.',
'Feedback del team':'Osservazioni interne del personale sulle conversazioni e sulla qualità dei contatti.',
'Informazioni dell’azienda':'Inserisci solo informazioni verificate che l’assistente può comunicare. Le modifiche valgono per le nuove conversazioni.',
'Informazioni da raccogliere':'Scegli quali dati servono per gestire una richiesta. I campi obbligatori devono essere compilati prima del salvataggio del contatto.',
'Conferme email':'Prepara una conferma se il cliente ha fornito un’email. L’invio reale richiede un servizio mittente configurato.',
'Autorizzazioni e strumenti dell’assistente':'Le autorizzazioni dell’azienda stabiliscono quali azioni può compiere l’assistente. Non sostituiscono il consenso del cliente.',
'Autorizzazioni':'Abilita solo le attività consentite dalla tua azienda. Le revoche bloccano le azioni; le nuove abilitazioni valgono per le nuove chat.',
'Identità e aspetto':'Personalizza nome, saluto, stile e aspetto della chat della tua azienda.',
'Obiettivi e instradamento':'Indica le priorità commerciali e, nelle impostazioni avanzate, le regole per valutare e assegnare i contatti.',
'Calendario di prova':'Inserisce disponibilità fittizie per provare le prenotazioni sul Mac. Non aggiorna calendari reali.',
'Attività e risultati':'Riepiloga lingue, prenotazioni di prova, punteggi e azioni della tua azienda.',
'Aggiornamenti proposti dalle fonti':'Leggi e approva i contenuti proposti prima di renderli disponibili all’assistente. Le informazioni private non vengono sovrascritte.',
'Gestione operatore':'Permette al personale di prendere in carico la conversazione, rispondere e restituirla all’assistente.',
'Esito commerciale':'Indica come è proseguito il rapporto con il cliente: dal primo contatto alla vendita o alla perdita della richiesta.',
'Nome dell’azienda':'Il nome utilizzato per identificare la tua attività nella configurazione e nella chat.',
'Settore':'Descrive l’ambito in cui opera l’azienda e aiuta a contestualizzare il dialogo.',
'Chi gestisce le richieste':'Indica il referente o il team a cui l’assistente prepara le richieste, per esempio il personale commerciale.',
'Paese predefinito dei numeri':'Serve a interpretare i numeri inseriti senza prefisso internazionale.',
'Informazioni verificate a disposizione dell’AI':'Scrivi servizi, orari e altri fatti confermati. Non inserire password, segreti o dati privati che l’assistente non deve conoscere.',
'Aggiungi un esempio di settore':'Aggiunge campi suggeriti. Puoi modificarli in base alle esigenze della tua attività.',
'Informazione':'Il nome del dato che desideri raccogliere durante la conversazione.',
'Formato':'Stabilisce se il dato è testo libero, numero di telefono o indirizzo email.',
'Obbligatorio':'Se selezionato, l’assistente deve ottenere questo dato prima di registrare una richiesta.',
'Nome visualizzato dell’assistente':'Il nome con cui si presenta la chat della tua azienda.',
'Messaggio iniziale':'Il saluto mostrato quando inizia una nuova conversazione.',
'Colore':'Il colore principale della chat aziendale.',
'Logo locale (/assets/nome.svg)':'Percorso di un’immagine già presente tra le risorse del sito. Non è un caricamento di file.',
'Avatar locale':'Percorso dell’immagine locale che rappresenta l’assistente.',
'Tono':'Descrive come deve parlare l’assistente, per esempio in modo professionale, breve e cortese.',
'Contatti pubblici':'I recapiti verificati che l’assistente può comunicare ai visitatori.',
'Posizione widget':'Preferenza di posizione prevista per il futuro inserimento della chat. Il pulsante flottante non è ancora attivo.',
'Obiettivi commerciali':'Le priorità della tua attività. Non autorizzano azioni o promesse non previste dai permessi.',
'Regole punteggio':'Impostazione tecnica avanzata: assegna punti con criteri espliciti, senza inventare valutazioni casuali.',
'Regole reparti':'Impostazione tecnica avanzata: stabilisce a quale reparto o referente indirizzare una richiesta.',
'Data e ora locale':'L’orario scelto viene registrato come disponibilità di prova. Usa una data futura.',
'Descrizione':'Una breve indicazione del tipo di appuntamento simulato.',
'Feedback su questa conversazione':'Commento interno visibile solo alla tua azienda. Non viene pubblicato come recensione.',
'Conversazione':'La cronologia dei messaggi scambiati durante questa richiesta.'};
let visible=null;
function close(){if(visible){visible.tip.hidden=true;visible.button.setAttribute('aria-expanded','false');visible=null}}
function add(target){if(target.dataset.helpReady)return;const title=[...target.childNodes].filter(n=>n.nodeType===3||n.nodeType===1&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(n.tagName)).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim();if(!title)return;target.dataset.helpReady='true';const button=document.createElement('button');button.type='button';button.className='help-icon';button.textContent='i';button.setAttribute('aria-label','Informazioni: '+title);button.setAttribute('aria-expanded','false');const tip=document.createElement('span');tip.className='help-tooltip';tip.role='tooltip';tip.id='help-'+crypto.randomUUID();tip.hidden=true;tip.textContent=specific[title]||(target.closest('#capabilities')?'Abilita questa attività solo se autorizzata dalla tua azienda. Le funzioni indicate come simulate restano prove locali.':title.includes('CRM')?'Prepara l’invio al CRM simulato dopo il consenso del cliente. Non contatta servizi esterni.':title.includes('conferma email')?'Prepara la conferma per il cliente. Per spedirla serve un mittente configurato.':'Impostazione di '+title.toLowerCase()+'. Le modifiche alla configurazione si applicano alle nuove conversazioni.');button.setAttribute('aria-describedby',tip.id);target.append(button);(target.closest('dialog')||document.body).append(tip);function show(){close();tip.hidden=false;button.setAttribute('aria-expanded','true');visible={tip,button};const r=button.getBoundingClientRect(),w=Math.min(300,innerWidth-24);tip.style.width=w+'px';tip.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';const h=tip.getBoundingClientRect().height;tip.style.top=(r.bottom+h+18<innerHeight?r.bottom+8:Math.max(8,r.top-h-8))+'px'}button.addEventListener('mouseenter',show);button.addEventListener('mouseleave',()=>{if(document.activeElement!==button)close()});button.addEventListener('focus',show);button.addEventListener('blur',close);button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();show()});}
function scan(){document.querySelectorAll('.dashboard h2,.dashboard h3,.dashboard legend,.dashboard label,.dash-dialog h3,.dash-dialog label').forEach(add)}
scan();new MutationObserver(scan).observe(document.querySelector('.dashboard'),{childList:true,subtree:true});document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});window.addEventListener('scroll',close,true);window.addEventListener('resize',close);
// Keyboard navigation between workspace tabs.
const tabs=[...document.querySelectorAll('[role=tab]')];function sync(){tabs.forEach(b=>{const active=b.getAttribute('aria-selected')==='true';b.tabIndex=active?0:-1;const panel=document.querySelector('#tab-'+b.dataset.tab);b.id='nav-'+b.dataset.tab;b.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',b.id)})}tabs.forEach((b,i)=>{b.addEventListener('click',sync);b.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%tabs.length;else if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;else return;e.preventDefault();tabs[n].click();tabs[n].focus()})});sync();
})();
