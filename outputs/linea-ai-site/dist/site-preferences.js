"use strict";
(()=>{
const languages=['it','en','es','fr'],version=1,ttl=180*86400000;
function read(key){try{return JSON.parse(localStorage.getItem(key))}catch{return null}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
function consent(){const c=read('linea.cookie-choice');return c&&c.version===version&&['accept','reject','necessary'].includes(c.choice)&&Number.isFinite(c.at)&&c.at<=Date.now()&&Date.now()-c.at<ttl?c:null}
function choose(choice){if(!['accept','reject','necessary'].includes(choice))return false;return save('linea.cookie-choice',{version,choice,at:Date.now(),necessary:true,optional:false})}
let lang=read('linea.language');if(!languages.includes(lang))lang='it';let dictionary={};
const originals=new WeakMap(),attributes=new WeakMap();
function t(text){return lang==='it'?text:(dictionary[text]?.[lang]||text)}
function translate(root=document.body){if(!root)return;const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=walk.nextNode()){
 if(!n.parentElement||n.parentElement.closest('script,style,textarea,#messages,[data-no-translate]'))continue;
 const current=n.nodeValue;let record=originals.get(n);if(!record||record.last!==current)record={source:current,last:current};
 const clean=record.source.trim(),translated=t(clean),next=record.source.replace(clean,translated);if(next!==current)n.nodeValue=next;record.last=next;originals.set(n,record);
 }
 root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el=>{let record=attributes.get(el)||{};for(const key of ['placeholder','aria-label','title']){if(!el.hasAttribute(key))continue;const current=el.getAttribute(key);if(!record[key]||record[key].last!==current)record[key]={source:current};const next=t(record[key].source);if(next!==current)el.setAttribute(key,next);record[key].last=next}attributes.set(el,record)});
 document.documentElement.lang=lang;
}
window.lineaPreferences={consent,choose,t,languages,setLanguage(value){if(!languages.includes(value))return false;lang=value;save('linea.language',value);translate();window.dispatchEvent(new Event('linea-language'));return true},get language(){return lang}};
async function init(){
 try{const r=await fetch('/translations.json');if(r.ok)dictionary=await r.json()}catch{}
 const cta=document.querySelector('.header-plan-cta');if(cta){const label=document.createElement('label');label.className='language-choice';label.setAttribute('aria-label','Language');const select=document.createElement('select');select.setAttribute('aria-label','Language / Lingua');[['it','Italiano'],['en','English'],['es','Español'],['fr','Français']].forEach(([code,name])=>{const o=document.createElement('option');o.value=code;o.textContent=name;select.append(o)});select.value=lang;select.addEventListener('change',()=>window.lineaPreferences.setLanguage(select.value));label.append(select);cta.after(label)}
 const banner=document.createElement('section');banner.id='cookie-choice';banner.setAttribute('role','region');banner.setAttribute('aria-labelledby','cookie-heading');
 banner.innerHTML='<h2 id="cookie-heading">Cookie: scegli come proseguire</h2><p>Usiamo solo tecnologie necessarie per accesso e preferenze. Non ci sono cookie pubblicitari o di analisi. Rifiuta e Solo obbligatori mantengono attive le funzioni necessarie; Accetta non attiva tracciatori né autorizza servizi futuri.</p><a href="/cookie.html">Informazioni sui cookie</a><div class="cookie-actions"><button type="button" data-choice="accept">Accetta</button><button type="button" data-choice="reject">Rifiuta</button><button type="button" data-choice="necessary">Solo obbligatori</button></div><small>Scelta salvata su questo browser per 180 giorni. Puoi modificarla dal fondo della pagina.</small>';
 banner.hidden=!!consent();banner.addEventListener('click',e=>{const b=e.target.closest('[data-choice]');if(!b)return;choose(b.dataset.choice);banner.hidden=true});document.body.append(banner);
 const reopen=document.createElement('button');reopen.type='button';reopen.className='cookie-reopen';reopen.textContent='Preferenze cookie';reopen.addEventListener('click',()=>{banner.hidden=false;banner.querySelector('button').focus()});(document.querySelector('footer')||document.querySelector('main')||document.body).append(reopen);
 translate();let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{translate();pending=false})}).observe(document.body,{subtree:true,childList:true,characterData:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
