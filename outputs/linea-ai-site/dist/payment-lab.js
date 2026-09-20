"use strict";
(async()=>{
 const list=document.querySelector('#payment-history'),status=document.querySelector('#payment-status');
 if(!list)return;
 async function request(path,body){const response=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await response.json();if(!response.ok)throw Error(data.error||'Operazione non riuscita.');return data;}
 const names={pending:'In attesa',succeeded:'Riuscito',failed:'Fallito',cancelled:'Annullato',partially_refunded:'Rimborsato in parte',refunded:'Rimborsato'};
 const money=cents=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(cents/100);
 async function load(){const data=await request('payments');list.replaceChildren();if(!data.payments.length){list.textContent='Non ci sono ancora operazioni simulate.';return;}
  for(const payment of data.payments){const item=document.createElement('li'),label=document.createElement('p');label.textContent=new Date(payment.created*1000).toLocaleString('it-IT')+' · '+money(payment.amount)+' · '+names[payment.status]+' · Rimborso: '+money(payment.refunded);item.append(label);
   if(['succeeded','partially_refunded'].includes(payment.status)){const button=document.createElement('button');button.className='button small dark';button.textContent='Simula rimborso residuo';const key=crypto.randomUUID();button.onclick=async()=>{button.disabled=true;try{await request('payment-refund',{payment_id:payment.id,amount:payment.amount-payment.refunded,key});status.textContent='Rimborso simulato registrato. Nessun denaro trasferito.';await load();}catch(error){status.textContent=error.message;button.disabled=false;}};item.append(button);}list.append(item);}
 }
 const form=document.querySelector('#payment-test');let pendingKey=null;
 form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;pendingKey=pendingKey||crypto.randomUUID();try{await request('payment-mock',{key:pendingKey,amount:1000,outcome:form.elements.outcome.value});pendingKey=null;status.textContent='Operazione simulata registrata: nessun addebito reale.';await load();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
 form.elements.outcome.onchange=()=>{pendingKey=null;};
 try{await load();}catch(error){status.textContent=error.message;}
})();
