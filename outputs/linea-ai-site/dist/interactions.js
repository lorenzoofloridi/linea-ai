'use strict';
(() => {
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const elements=document.querySelectorAll('.hero-copy,.hero-visual,.section-top,.benefits article,.steps article,.brand-experience,.demo-copy,.chat-panel,.roadmap>div,.contact-grid>div');
 if('IntersectionObserver' in window && !motion.matches){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('revealed');observer.unobserve(entry.target)}}),{threshold:0.08});
  elements.forEach((el,i)=>{el.classList.add('reveal');el.style.setProperty('--reveal-delay',`${i%3*65}ms`);observer.observe(el)});
  motion.addEventListener('change',()=>{if(motion.matches){elements.forEach(el=>el.classList.add('revealed'));observer.disconnect()}});
 }
 const stages=[['Si parte dall’ascolto.','L’assistente accoglie la domanda e cerca di capire che cosa serve alla persona.'],['Le informazioni prendono forma.','Nome, recapito, interesse e tempistica: una richiesta ordinata, da registrare solo con il consenso.'],['La relazione passa al team.','La azienda consulta il foglio e sceglie come gestire il contatto. Nessuna prenotazione automatica.']];
 document.querySelectorAll('[data-journey]').forEach(button=>button.addEventListener('click',()=>{
  const i=Number(button.dataset.journey);
  document.querySelectorAll('[data-journey]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  const panel=document.querySelector('.journey-detail');
  panel.querySelector('h3').textContent=stages[i][0];panel.querySelector('p').textContent=stages[i][1];
  document.querySelector('.experience-count').textContent=`STEP ${i+1} / STEP 3`;
  document.querySelector('.brand-experience').dataset.stage=i;
  if(!motion.matches && panel.animate)panel.animate([{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'});
 }));
 const dialog=document.querySelector('#privacy-dialog'),body=document.querySelector('#privacy-body');
 let trigger=null,loaded=false;
 document.querySelectorAll('[data-privacy]').forEach(link=>link.addEventListener('click',async event=>{
  if(!dialog.showModal || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
  event.preventDefault();trigger=link;dialog.showModal();document.querySelector('#close-privacy').focus();
  if(!loaded){try{const response=await fetch('privacy.html');if(!response.ok)throw Error();const doc=new DOMParser().parseFromString(await response.text(),'text/html');const content=doc.querySelector('#legal-content');if(!content)throw Error();body.replaceChildren(...Array.from(content.childNodes));loaded=true}catch{body.innerHTML='<h2 id="privacy-title">Come usiamo i dati</h2><p>Non riesco a caricare il testo. Puoi aprire la pagina completa dal collegamento qui sotto.</p>'}}
 }));
 document.querySelector('#close-privacy').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>trigger?.focus());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}});
})();
