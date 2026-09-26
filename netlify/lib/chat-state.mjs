export const initialState=()=>({data:{},saved:false,pending:false,closed:false,declined:false,count:0,language:'it'});
const copies={
 it:{updated:'Ho aggiornato i dati della tua richiesta',consent:'Acconsenti a essere contattato dall’azienda tramite il recapito indicato?',saved:'La tua richiesta è stata registrata per l’azienda. Posso aiutarti con altro?',closed:'Grazie, buona giornata.',refused:'Va bene, nessun problema. La richiesta non verrà registrata.',invalid:'Il recapito inserito non sembra valido. Puoi controllarlo?',summary:'Informazioni registrate'},
 en:{updated:'I have updated your request',consent:'Do you agree to be contacted by the company using the contact details provided?',saved:'Your request has been saved for the company. Can I help you with anything else?',closed:'Thank you. Have a good day.',refused:'No problem. Your request will not be saved.',invalid:'These contact details do not seem valid. Could you check them?',summary:'Saved information'},
 fr:{updated:'J’ai mis à jour votre demande',consent:'Acceptez-vous que l’entreprise vous contacte aux coordonnées indiquées ?',saved:'Votre demande a été enregistrée pour l’entreprise. Puis-je vous aider autrement ?',closed:'Merci, bonne journée.',refused:'Aucun problème. Votre demande ne sera pas enregistrée.',invalid:'Ces coordonnées semblent incorrectes. Pouvez-vous les vérifier ?',summary:'Informations enregistrées'},
 es:{updated:'He actualizado tu solicitud',consent:'¿Aceptas que la empresa te contacte utilizando los datos indicados?',saved:'Tu solicitud ha sido registrada para la empresa. ¿Puedo ayudarte en algo más?',closed:'Gracias, que tengas un buen día.',refused:'No hay problema. Tu solicitud no se guardará.',invalid:'Los datos de contacto no parecen válidos. ¿Puedes revisarlos?',summary:'Información registrada'},
 de:{updated:'Ich habe Ihre Anfrage aktualisiert',consent:'Darf das Unternehmen Sie über die angegebenen Kontaktdaten kontaktieren?',saved:'Ihre Anfrage wurde für das Unternehmen gespeichert. Kann ich Ihnen sonst noch helfen?',closed:'Vielen Dank. Einen schönen Tag.',refused:'Kein Problem. Ihre Anfrage wird nicht gespeichert.',invalid:'Die Kontaktdaten scheinen ungültig zu sein. Können Sie diese prüfen?',summary:'Gespeicherte Informationen'}
};
// Campo automatico per le risposte alle domande chieste dalle istruzioni dell'azienda
// (per esempio «chiedi sempre il budget»): finisce nella richiesta e nell'export.
export const DETAILS_FIELD=Object.freeze({key:'dettagli',label:'Altri dettagli',kind:'text',required:false,auto:true});
export function fields(config){const caps=config.agent?.capabilities||{};if(caps.can_collect_leads===false)return [];const list=(config.fields||[]).filter(f=>!(f.kind==='phone'&&caps.can_request_phone===false)&&!(f.kind==='email'&&caps.can_request_email===false));return list.length&&!list.some(f=>f.key===DETAILS_FIELD.key)?[...list,DETAILS_FIELD]:list;}
// Un nome valido: 2-80 caratteri, niente cifre, niente frasi come "non mi chiamo".
const validName=v=>v.length>=2&&v.length<=80&&!/\d/.test(v)&&!/^(non|no|mi chiamo|sono|il mio nome)\b/i.test(v)&&v.split(/\s+/).length<=5;
// Data e ora in italiano, ora di Roma (non il formato tecnico ISO).
const when=()=>new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',dateStyle:'short',timeStyle:'short'}).format(new Date());
export function advance(config,previous,message,result){
 const state=structuredClone(previous),fs=fields(config);state.language=copies[result.language]?result.language:state.language;const t=copies[state.language]||copies.it;let changed=false,invalid=false;
 let updated=false;
 if(!state.declined) for(const item of result.extracted.slice(0,18)){
  if(!item||typeof item!=='object')continue;
  const f=fs.find(f=>f.key===item.key);if(!f||typeof item.quote!=='string'||!item.quote.trim()||!message.toLowerCase().includes(item.quote.toLowerCase())||typeof item.value!=='string'||!item.value.trim()||item.value.length>500)continue;
  if(state.saved&&state.data[f.key]===undefined)continue;
  let value=item.quote.trim();
  if(f.kind==='phone'){const candidates=value.match(/(?:\+\d|\d)[\d\s().-]{6,24}\d/g)||[];if(candidates.length===1)value=candidates[0];value=value.replace(/[\s().-]/g,'');if(!/^\d{10}$/.test(value)&&!/^\+[1-9]\d{7,14}$/.test(value)){invalid=true;if(!state.saved){delete state.data[f.key];changed=true;}continue;}}
  if(f.kind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){invalid=true;if(!state.saved){delete state.data[f.key];changed=true;}continue;}
  if(f.key==='nome'){const v=item.value.trim().replace(/\s+/g,' ');if(!message.toLowerCase().includes(v.toLowerCase())||!validName(v))continue;value=v;}
  if(f.key==='interesse')value=item.value.trim();
  // Altri dettagli: si aggiungono uno dopo l'altro («Budget: 20.000 € · Permuta: sì»).
  if(f.auto){const v=item.value.trim().replace(/\s+/g,' ').slice(0,300);const prev=state.data[f.key]||'';if(prev.toLowerCase().includes(v.toLowerCase()))continue;value=(prev?prev+' · ':'')+v;if(value.length>1500)continue;}
  if(f.key==='tempistica')value=item.value.trim()+' (indicata il '+when()+')';
  const before=state.data[f.key];
  // Dopo il salvataggio si accettano solo correzioni di dati già registrati.
  if(state.saved&&before===undefined)continue;
  if(f.key==='tempistica'&&before&&before.startsWith(item.value.trim()+' (indicata il '))continue;
  if(before!==value){changed=true;if(state.saved)updated=true;}state.data[f.key]=value;
 }
 const missing=fs.filter(f=>f.required&&!state.data[f.key]);if(changed)state.pending=false;
 let reply=result.reply,save=false,update=false;
 const evidence=typeof result.consent_quote==='string'&&result.consent_quote.trim()===message.trim();
 if(previous.pending&&evidence&&result.consent==='negative'&&!state.saved){state.declined=true;state.pending=false;reply=t.refused;}
 else if(previous.pending&&!changed&&evidence&&result.consent==='positive'&&!state.saved&&!state.declined&&!missing.length&&fs.length){save=true;state.saved=true;state.pending=false;state.consent=message;reply=t.saved;}
 else if(updated){update=true;reply=t.updated+':\n'+fs.filter(f=>state.data[f.key]).map(f=>`${f.label}: ${state.data[f.key]}`).join('\n');}
 else if(invalid)reply=t.invalid;
 else if(!state.saved&&!state.declined&&!missing.length&&fs.length&&(result.action==='consent'||previous.pending)){state.pending=true;reply=fs.filter(f=>state.data[f.key]).map(f=>`${f.label}: ${state.data[f.key]}`).join('\n')+'\n\n'+t.consent;}
 else if(result.action==='summary'&&state.saved)reply=t.summary+':\n'+fs.filter(f=>state.data[f.key]).map(f=>`${f.label}: ${state.data[f.key]}`).join('\n');
 else if(result.action==='close'&&!changed&&!invalid&&!/\?/.test(message)){state.closed=true;state.pending=false;reply=t.closed;}
 state.count++;return {state,reply,save,update};
}
