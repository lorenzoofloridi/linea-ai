'use strict';
let session=null,sessionPromise=null,busy=false,consentPending=false,leadSaved=false,trialId=crypto.randomUUID();
const companyToken=new URLSearchParams(location.search).get('azienda')||'demo';let greetingText='Ciao, come posso aiutarti oggi?';
const $=s=>document.querySelector(s),messages=$('#messages');
async function api(path,data){const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let d;try{d=await r.json()}catch{throw Error('Connessione interrotta. Controlla la richiesta prima di riprovare.')}if(!r.ok)throw Error(d.error||'Operazione non riuscita.');return d}
async function getSession(){if(session)return session;if(!sessionPromise)sessionPromise=api('session',{company:companyToken}).then(d=>{session=d.session;return session}).finally(()=>{sessionPromise=null});return sessionPromise}
function addMessage(text,kind){const el=document.createElement('div');el.className='message '+kind;el.textContent=text;messages.append(el);messages.scrollTop=messages.scrollHeight;return el}
async function send(text,preference=null){if(busy||!text.trim())return;busy=true;if($('#open-contact-picker'))$('#open-contact-picker').disabled=true;$('#send-button').disabled=true;$('#chat-input').disabled=true;$('#reset-chat').disabled=true;$('#suggestions').hidden=true;addMessage(text,'user');const waiting=addMessage('','waiting');waiting.setAttribute('aria-label','L’assistente sta rispondendo');for(let i=0;i<3;i++){const dot=document.createElement('span');dot.className='typing-dot';dot.setAttribute('aria-hidden','true');waiting.append(dot)}

try{const sid=await getSession();const d=await api('chat',{session:sid,message:text,request_id:crypto.randomUUID(),...(preference?{contact_preference:preference}:{})});waiting.remove();addMessage(d.reply,'bot');consentPending=d.consent_pending;leadSaved=d.saved;if(d.closed){$('#chat-input').placeholder='Conversazione conclusa: inizia una nuova chat';}if(d.saved){$('#chat-note').textContent='Richiesta registrata per l’azienda';$('#feedback').hidden=false}}
catch(e){waiting.className='message error';waiting.textContent=e.message}
finally{busy=false;if($('#open-contact-picker'))$('#open-contact-picker').disabled=leadSaved;$('#send-button').disabled=false;$('#chat-input').disabled=false;$('#reset-chat').disabled=false;$('#chat-input').focus();messages.scrollTop=messages.scrollHeight}}
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();const text=$('#chat-input').value.trim();if(!text)return;$('#chat-input').value='';send(text)});
$('#suggestions').addEventListener('click',e=>{if(e.target.tagName==='BUTTON')send(e.target.textContent)});
$('#reset-chat').addEventListener('click',()=>{if(busy)return;if(messages.children.length>1&&!confirm('Iniziare una nuova conversazione? Le richieste già registrate rimangono nell’area dell’azienda.'))return;session=null;sessionPromise=null;consentPending=false;leadSaved=false;if($('#open-contact-picker'))$('#open-contact-picker').disabled=false;messages.replaceChildren();addMessage(greetingText,'bot');$('#feedback').hidden=true;$('#feedback-form').reset();$('#feedback-result').textContent='';$('#feedback-form button').disabled=false;$('#suggestions').hidden=false;$('#chat-note').textContent='Conversazione privata · dati di prova';$('#chat-input').focus()});
$('#end-chat').addEventListener('click',()=>{$('#feedback').hidden=!$('#feedback').hidden;if(!$('#feedback').hidden)$('#feedback').scrollIntoView({behavior:'smooth',block:'nearest'})});
$('#feedback-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('feedback',{session:await getSession(),rating:Number(new FormData(e.target).get('rating')),comment:$('#feedback-text').value});$('#feedback-result').textContent='Grazie, il feedback è stato salvato nell’archivio privato.'}catch(err){$('#feedback-result').textContent=err.message;button.disabled=false}});
$('#contact-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#contact-result').textContent='Salvataggio della richiesta…';const form=new FormData(e.target);try{const result=await api('trial',{request_id:trialId,name:form.get('name'),company:form.get('company'),email:form.get('email'),message:form.get('message'),consent:form.get('consent')==='on'});$('#contact-result').textContent=result.email_status==='not_configured'?'Richiesta inviata. Ti risponderemo al più presto all’email indicata.':'Richiesta registrata. L’email di conferma è in attesa di invio.';e.target.reset();trialId=crypto.randomUUID()}catch(err){$('#contact-result').textContent=err.message}finally{button.disabled=false}});
fetch('/api/health').then(r=>r.json()).then(d=>{$('#connection-status').textContent=d.model_ready?'Assistente online disponibile.':'L’assistente non è raggiungibile in questo momento. Riprova tra qualche minuto.'}).catch(()=>{$('#connection-status').textContent='Collegamento alla demo non disponibile.'});
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'open_live_demo',title:'Apri la demo della chat',description:'Porta alla demo visibile e mette a fuoco il campo messaggio. Non invia messaggi e non salva dati.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('Non sono previsti parametri.');$('#demo').scrollIntoView();$('#chat-input').focus();return{opened:true}}})}catch{/* Il sito funziona anche senza WebMCP. */}}

const picker=$('#contact-picker');
if(companyToken==='demo')document.querySelector('.contact-picker-bar').remove();
if(companyToken!=='demo'){
$('#open-contact-picker').addEventListener('click',()=>{if(busy)return;$('#contact-day').min=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('#picker-error').textContent='';picker.showModal()});
$('#close-contact-picker').addEventListener('click',()=>picker.close());
$('#contact-band').addEventListener('change',()=>{const exact=$('#contact-band').value==='exact';$('#contact-time').hidden=!exact;$('#contact-time-label').hidden=!exact;$('#contact-time').required=exact});
$('#contact-preference-form').addEventListener('submit',event=>{event.preventDefault();if(busy)return;const day=$('#contact-day').value,band=$('#contact-band').value,clock=band==='exact'?$('#contact-time').value:'';if(!day||day<$('#contact-day').min)return;const text='Preferisco essere contattato il '+day+(clock?' alle '+clock:(band?' — '+band:''));picker.close();send(text,{day,time:clock,band:band==='exact'?'':band})});

}
api('public',{company:companyToken}).then(d=>{greetingText=d.greeting;document.querySelector('.chat-header strong').textContent=d.name;if(messages.children.length===1)messages.firstElementChild.textContent=d.greeting;}).catch(e=>{$('#connection-status').textContent=e.message;$('#send-button').disabled=true;});
if(companyToken!=='demo'){
  document.body.classList.add('chat-only');
  document.querySelector('.demo-copy h2').textContent='Prova la tua AI';
  document.querySelector('.demo-tip').hidden=true;
  document.querySelector('#offerte')?.remove();
}

window.lineaAgentSession=getSession;window.lineaAgentMessage=addMessage;

// La scelta di giorno e fascia oraria serve solo agli assistenti delle aziende, non alla chat informativa di MoreAI.
(()=>{const bar=document.querySelector('.contact-picker-bar');if(bar&&companyToken==='demo')bar.hidden=true;
if(companyToken!=='demo'){const copy=document.querySelector('.demo-copy');if(copy){const eyebrow=copy.querySelector('.eyebrow'),title=copy.querySelector('h2'),text=copy.querySelector('.body-lg'),tip=copy.querySelector('.demo-tip');if(eyebrow)eyebrow.textContent='CHAT DI PROVA';if(title)title.textContent='Prova il tuo assistente.';if(text)text.textContent='Scrivi come farebbe un tuo cliente: l’assistente risponde con le informazioni della tua azienda. Le richieste complete compaiono nella tua dashboard come richieste di prova.';if(tip)tip.hidden=true}}})();
