"use strict";
(()=>{
const languages=['it','en','es','fr'],version=1,ttl=180*86400000;
function read(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function consent(){const c=read('linea.cookie-choice');return c&&c.version===version&&['accept','reject','necessary'].includes(c.choice)&&Number.isFinite(c.at)&&c.at<=Date.now()&&Date.now()-c.at<ttl?c:null}
function choose(choice){if(!['accept','reject','necessary'].includes(choice))return false;return save('linea.cookie-choice',{version,choice,at:Date.now(),necessary:true,optional:false})}
let lang=read('linea.language');if(!languages.includes(lang))lang='it';let dictionary={};
const originals=new WeakMap(),attributes=new WeakMap();let originalTitle=null;
// Testi composti dal codice (date, numeri, nomi): regole con segnaposto.
const months={gennaio:['January','enero','janvier'],febbraio:['February','febrero','février'],marzo:['March','marzo','mars'],aprile:['April','abril','avril'],maggio:['May','mayo','mai'],giugno:['June','junio','juin'],luglio:['July','julio','juillet'],agosto:['August','agosto','août'],settembre:['September','septiembre','septembre'],ottobre:['October','octubre','octobre'],novembre:['November','noviembre','novembre'],dicembre:['December','diciembre','décembre']};
const li=()=>({en:0,es:1,fr:2})[lang];
const dateT=x=>x.replace(/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/g,m=>months[m][li()]);
let lower=null;const loose=x=>{if(!lower){lower={};for(const k in dictionary)lower[k.toLowerCase()]=k}const k=dictionary[x]?x:lower[x.toLowerCase()];return k?dictionary[k][lang]:x};
const plan=x=>{const m=/^Piano (.+)$/.exec(x);return m?[m[1]+' plan','Plan '+m[1],'Offre '+m[1]][li()]:x};
const rules=[
 [/^(TEST · |DEMO · )?Conversazione del (.+)$/,m=>(m[1]||'')+['Conversation of ','Conversación del ','Conversation du '][li()]+m[2]],
 [/^Impostazione di (.+)\. Le modifiche alla configurazione si applicano alle nuove conversazioni\.$/,m=>['Setting: ','Configuración: ','Paramètre : '][li()]+loose(m[1])+['. Configuration changes apply to new conversations.','. Los cambios de configuración se aplican a las nuevas conversaciones.','. Les modifications de configuration s’appliquent aux nouvelles conversations.'][li()]],
 [/^La Demo termina il (.+)\. I tuoi dati restano salvati anche dopo\.$/,m=>[`The Demo ends on ${dateT(m[1])}. Your data stays saved afterwards too.`,`La Demo termina el ${dateT(m[1])}. Tus datos siguen guardados también después.`,`La Démo se termine le ${dateT(m[1])}. Vos données restent enregistrées ensuite.`][li()]],
 [/^Il conteggio riparte il primo giorno di ogni mese\. Rimangono (.+) messaggi\.$/,m=>[`The count restarts on the first day of each month. ${m[1]} messages remaining.`,`El recuento se reinicia el primer día de cada mes. Quedan ${m[1]} mensajes.`,`Le compteur repart le premier jour de chaque mois. Il reste ${m[1]} messages.`][li()]],
 [/^Il tuo piano: (.+)\.$/,m=>['Your plan: ','Tu plan: ','Votre offre : '][li()]+plan(m[1])+'.'],
 [/^Rinnovo o scadenza: (.+)\.$/,m=>['Renewal or expiry: ','Renovación o vencimiento: ','Renouvellement ou échéance : '][li()]+dateT(m[1])+'.'],
 [/^(\d+) conversazioni$/,m=>m[1]+[' conversations',' conversaciones',' conversations'][li()]],
 [/^(\d+) richieste$/,m=>m[1]+[' requests',' solicitudes',' demandes'][li()]],
 [/^([\d.,]+)% delle conversazioni ha prodotto una richiesta$/,m=>m[1]+['% of conversations led to a request','% de las conversaciones generó una solicitud',' % des conversations ont généré une demande'][li()]],
 [/^Valutazione media visitatori: nessuna$/,()=>['Average visitor rating: none','Valoración media de los visitantes: ninguna','Note moyenne des visiteurs : aucune'][li()]],
 [/^Valutazione media visitatori: (\S+) su (\d+) feedback(?: \(questo mese (\S+)\))?$/,m=>[`Average visitor rating: ${m[1]} from ${m[2]} ratings`,`Valoración media de los visitantes: ${m[1]} de ${m[2]} opiniones`,`Note moyenne des visiteurs : ${m[1]} sur ${m[2]} avis`][li()]+(m[3]?[` (this month ${m[3]})`,` (este mes ${m[3]})`,` (ce mois-ci ${m[3]})`][li()]:'')]
];
function rule(x){for(const [re,f] of rules){const m=re.exec(x);if(m)return f(m)}return null}
function t(text){if(lang==='it')return text;const d=dictionary[text]?.[lang];if(d)return d;const r=rule(text);if(r!==null)return r;if(text.includes(' · ')){const parts=text.split(' · '),out=parts.map(x=>dictionary[x]?.[lang]||rule(x)||x);if(out.some((x,i)=>x!==parts[i]))return out.join(' · ')}return text}
function translate(root=document.body){if(!root)return;const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode()){
 if(!n.parentElement||n.parentElement.closest('script,style,textarea,#messages,#test-chat-messages,#detail-messages,#detail-summary,[data-no-translate]'))continue;
 const current=n.nodeValue;let record=originals.get(n);if(!record||record.last!==current)record={source:current,last:current};
 const clean=record.source.trim(),translated=t(clean),next=record.source.replace(clean,translated);if(next!==current)n.nodeValue=next;record.last=next;originals.set(n,record);
 }
 root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el=>{let record=attributes.get(el)||{};for(const key of ['placeholder','aria-label','title']){if(!el.hasAttribute(key))continue;const current=el.getAttribute(key);if(!record[key]||record[key].last!==current)record[key]={source:current};const next=t(record[key].source);if(next!==current)el.setAttribute(key,next);record[key].last=next}attributes.set(el,record)});
 document.documentElement.lang=lang;
 if(originalTitle===null)originalTitle=document.title;document.title=t(originalTitle);
}
window.lineaPreferences={consent,choose,t,languages,setLanguage(value){if(!languages.includes(value))return false;lang=value;save('linea.language',value);translate();window.dispatchEvent(new Event('linea-language'));return true},get language(){return lang}};
// Selettore lingua in ogni pagina: accanto al pulsante piani (home),
// nel menu dell'area riservata, oppure nell'intestazione prima del link finale.
function place(label){
 const cta=document.querySelector('.header-plan-cta');if(cta){cta.after(label);return}
 const actions=document.querySelector('.workspace-actions');if(actions){actions.prepend(label);return}
 const header=document.querySelector('body>header');
 if(header){label.classList.add('in-header');const last=header.lastElementChild;if(last&&last!==header.firstElementChild)last.before(label);else header.append(label);return}
 label.classList.add('floating');document.body.prepend(label);
}
async function init(){
 try{const r=await fetch('/translations.json');if(r.ok){dictionary=await r.json();lower=null}}catch{}
 const label=document.createElement('label');label.className='language-choice';label.setAttribute('aria-label','Language');const select=document.createElement('select');select.setAttribute('aria-label','Language / Lingua');[['it','Italiano'],['en','English'],['es','Español'],['fr','Français']].forEach(([code,name])=>{const o=document.createElement('option');o.value=code;o.textContent=name;select.append(o)});select.value=lang;
 // Su schermi stretti mostra solo il codice (IT, EN, ES, FR) per non affollare l'intestazione.
 const narrow=matchMedia('(max-width:640px)'),names=['Italiano','English','Español','Français'],short=()=>[...select.options].forEach((o,i)=>{o.textContent=narrow.matches&&!document.querySelector('.header-plan-cta')?o.value.toUpperCase():names[i]});short();narrow.addEventListener?.('change',short);
 select.addEventListener('change',()=>window.lineaPreferences.setLanguage(select.value));label.append(select);place(label)
 const banner=document.createElement('section');banner.id='cookie-choice';banner.setAttribute('role','region');banner.setAttribute('aria-labelledby','cookie-heading');
 banner.innerHTML='<h2 id="cookie-heading">Cookie: scegli come proseguire</h2><p>Usiamo solo tecnologie necessarie per accesso e preferenze. Non ci sono cookie pubblicitari o di analisi. Rifiuta e Solo obbligatori mantengono attive le funzioni necessarie; Accetta non attiva tracciatori né autorizza servizi futuri.</p><a href="/cookie.html">Informazioni sui cookie</a><div class="cookie-actions"><button type="button" data-choice="accept">Accetta</button><button type="button" data-choice="reject">Rifiuta</button><button type="button" data-choice="necessary">Solo obbligatori</button></div><small>Scelta salvata su questo browser per 180 giorni. Puoi modificarla dal fondo della pagina.</small>';
 banner.hidden=!!consent();banner.addEventListener('click',e=>{const b=e.target.closest('[data-choice]');if(!b)return;choose(b.dataset.choice);banner.hidden=true});document.body.append(banner);
 const reopen=document.createElement('button');reopen.type='button';reopen.className='cookie-reopen';reopen.textContent='Preferenze cookie';reopen.addEventListener('click',()=>{banner.hidden=false;banner.querySelector('button').focus()});(document.querySelector('footer')||document.querySelector('main')||document.body).append(reopen);
 translate();if(lang!=='it')window.dispatchEvent(new Event('linea-language'));let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{translate();pending=false})}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
