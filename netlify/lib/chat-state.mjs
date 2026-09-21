export const initialState=()=>({data:{},saved:false,pending:false,closed:false,declined:false,count:0,language:'it'});
const copies={
 it:{consent:'Acconsenti a essere contattato dall’azienda tramite il recapito indicato?',saved:'La tua richiesta è stata registrata per l’azienda. Posso aiutarti con altro?',closed:'Grazie, buona giornata!',refused:'Va bene, nessun problema. La richiesta non verrà registrata.',invalid:'Il recapito inserito non sembra valido. Puoi controllarlo?',summary:'Informazioni registrate'},
 en:{consent:'Do you agree to be contacted by the company using the contact details provided?',saved:'Your request has been saved for the company. Can I help you with anything else?',closed:'Thank you. Have a good day!',refused:'No problem. Your request will not be saved.',invalid:'These contact details do not seem valid. Could you check them?',summary:'Saved information'},
 fr:{consent:'Acceptez-vous que l’entreprise vous contacte aux coordonnées indiquées ?',saved:'Votre demande a été enregistrée pour l’entreprise. Puis-je vous aider autrement ?',closed:'Merci, bonne journée !',refused:'Aucun problème. Votre demande ne sera pas enregistrée.',invalid:'Ces coordonnées semblent incorrectes. Pouvez-vous les vérifier ?',summary:'Informations enregistrées'},
 es:{consent:'¿Aceptas que la empresa te contacte utilizando los datos indicados?',saved:'Tu solicitud ha sido registrada para la empresa. ¿Puedo ayudarte en algo más?',closed:'¡Gracias, que tengas un buen día!',refused:'No hay problema. Tu solicitud no se guardará.',invalid:'Los datos de contacto no parecen válidos. ¿Puedes revisarlos?',summary:'Información registrada'},
 de:{consent:'Darf das Unternehmen Sie über die angegebenen Kontaktdaten kontaktieren?',saved:'Ihre Anfrage wurde für das Unternehmen gespeichert. Kann ich Ihnen sonst noch helfen?',closed:'Vielen Dank. Einen schönen Tag!',refused:'Kein Problem. Ihre Anfrage wird nicht gespeichert.',invalid:'Die Kontaktdaten scheinen ungültig zu sein. Können Sie diese prüfen?',summary:'Gespeicherte Informationen'}
};
export function fields(config){const caps=config.agent?.capabilities||{};return (config.fields||[]).filter(f=>caps.can_collect_leads!==false && !(f.kind==='phone'&&caps.can_request_phone===false)&&!(f.kind==='email'&&caps.can_request_email===false));}
export function advance(config,previous,message,result){
 const state=structuredClone(previous),fs=fields(config);state.language=copies[result.language]?result.language:state.language;const t=copies[state.language]||copies.it;let changed=false,invalid=false;
 if(!state.saved && !state.declined) for(const item of result.extracted.slice(0,18)){
  if(!item||typeof item!=='object')continue;
  const f=fs.find(f=>f.key===item.key);if(!f||typeof item.quote!=='string'||!item.quote.trim()||!message.toLowerCase().includes(item.quote.toLowerCase())||typeof item.value!=='string'||!item.value.trim()||item.value.length>500)continue;
  let value=item.quote.trim();
  if(f.kind==='phone'){const candidates=value.match(/(?:\+\d|\d)[\d\s().-]{6,24}\d/g)||[];if(candidates.length===1)value=candidates[0];value=value.replace(/[\s().-]/g,'');if(!/^\d{10}$/.test(value)&&!/^\+[1-9]\d{7,14}$/.test(value)){invalid=true;delete state.data[f.key];changed=true;continue;}}
  if(f.kind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){invalid=true;delete state.data[f.key];changed=true;continue;}
  if(f.key==='nome'&&item.quote.toLowerCase().includes(item.value.trim().toLowerCase()))value=item.value.trim();
  if(f.key==='interesse')value=item.value.trim();
  if(f.key==='tempistica')value=item.value.trim()+' (preferenza espressa il '+new Date().toISOString()+')';
  changed ||= state.data[f.key]!==value;state.data[f.key]=value;
 }
 const missing=fs.filter(f=>f.required&&!state.data[f.key]);if(changed)state.pending=false;
 let reply=result.reply,save=false;
 const evidence=typeof result.consent_quote==='string'&&result.consent_quote.trim()===message.trim();
 if(previous.pending&&evidence&&result.consent==='negative'&&!state.saved){state.declined=true;state.pending=false;reply=t.refused;}
 else if(previous.pending&&!changed&&evidence&&result.consent==='positive'&&!state.saved&&!state.declined&&!missing.length&&fs.length){save=true;state.saved=true;state.pending=false;state.consent=message;reply=t.saved;}
 else if(invalid)reply=t.invalid;
 else if(!state.saved&&!state.declined&&!missing.length&&fs.length&&(result.action==='consent'||previous.pending)){state.pending=true;reply=fs.filter(f=>state.data[f.key]).map(f=>`${f.label}: ${state.data[f.key]}`).join('\n')+'\n\n'+t.consent;}
 else if(result.action==='summary'&&state.saved)reply=t.summary+':\n'+fs.filter(f=>state.data[f.key]).map(f=>`${f.label}: ${state.data[f.key]}`).join('\n');
 else if(result.action==='close'){state.closed=true;state.pending=false;reply=t.closed;}
 state.count++;return {state,reply,save};
}
