'use strict';
(async()=>{
 const form=document.querySelector('#change-plan-form');if(!form)return;
 const status=document.querySelector('#lifecycle-status');let pendingKey=null,catalog;
 async function api(path,body){const r=await fetch('/api/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
 const money=x=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(x/100);
 function quote(){const plan=catalog.plans.find(p=>p.code===form.elements.plan.value);document.querySelector('#change-quote').textContent=money(form.elements.period.value==='annual'?plan.annual_cents:plan.monthly_cents)+(form.elements.period.value==='annual'?' all’anno':' al mese');}
 async function refresh(){const state=await api('plan-state');catalog=await api('plans');document.querySelector('#grace-days').textContent=state.grace_days;const sub=state.subscription;document.querySelector('#lifecycle-controls').hidden=!sub;if(!sub)return;form.elements.plan.value=sub.pending_plan||sub.plan;form.elements.period.value=sub.pending_period||sub.period;quote();document.querySelector('#lifecycle-summary').textContent='Piano: '+sub.plan+(sub.pending_plan?' · Cambio programmato: '+sub.pending_plan+' ('+sub.pending_period+')':'')+(sub.grace_until?' · Tolleranza fino al '+new Date(sub.grace_until*1000).toLocaleString('it-IT'):'');form.querySelector('button').disabled=!['trial','active'].includes(sub.status)||!!sub.cancel_at_end;}
 form.onchange=quote;
 form.onsubmit=async e=>{e.preventDefault();try{await api('plan-change',{plan:form.elements.plan.value,period:form.elements.period.value,confirm:form.elements.confirm.checked});status.textContent='Cambio programmato per il prossimo rinnovo.';await refresh();}catch(e){status.textContent=e.message;}};
 document.querySelector('#reactivate-plan').onclick=async()=>{if(!document.querySelector('#reactivate-confirm').checked){status.textContent='Conferma prima la riattivazione.';return;}pendingKey=pendingKey||crypto.randomUUID();try{await api('plan-reactivate',{key:pendingKey,confirm:true});pendingKey=null;location.reload();}catch(e){status.textContent=e.message;}};
 try{await refresh();}catch(e){status.textContent=e.message;}
})();
