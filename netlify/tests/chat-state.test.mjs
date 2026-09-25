import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advance,initialState} from '../lib/chat-state.mjs';
import {interpret} from '../lib/online-ai.mjs';
const cfg={fields:[{key:'nome',label:'Nome',kind:'text',required:true},{key:'telefono',label:'Telefono',kind:'phone',required:true},{key:'interesse',label:'Interesse',kind:'text',required:true}]};
const r=(over={})=>({reply:'Come posso aiutarti?',language:'it',action:'continue',consent:'none',consent_quote:'',extracted:[],...over});
test('all spontaneous data accepted, phone without prefix; explicit consent required',()=>{
 let t=advance(cfg,initialState(),'Sono Mario, 3331234567, vorrei un apparecchio+',r({action:'consent',extracted:[{key:'nome',quote:'Mario',value:'Mario'},{key:'telefono',quote:'3331234567',value:'3331234567'},{key:'interesse',quote:'un apparecchio+',value:'Ortodonzia — apparecchio'}]}));
 assert.equal(t.state.data.interesse,'Ortodonzia — apparecchio');assert.equal(t.state.data.telefono,'3331234567');assert.equal(t.save,false);assert.equal(t.state.pending,true);
 t=advance(cfg,t.state,'Yes',r({language:'en',consent:'positive',consent_quote:'Yes'}));assert.equal(t.save,true);assert.match(t.reply,/saved/);
 const again=advance(cfg,t.state,'Yes',r({consent:'positive',consent_quote:'Yes'}));assert.equal(again.save,false);
});
test('no consent out of context and no invented data',()=>{
 const t=advance(cfg,initialState(),'Ciao',r({consent:'positive',consent_quote:'Ciao',extracted:[{key:'nome',quote:'Mario',value:'Mario'}]}));assert.deepEqual(t.state.data,{});assert.equal(t.save,false);
});
test('correction invalidates pending consent; malformed phone rejected',()=>{
 const s={...initialState(),pending:true,data:{nome:'Mario',telefono:'3331234567',interesse:'Auto'}};
 const t=advance(cfg,s,'No il numero è 12',r({consent:'positive',consent_quote:'No il numero è 12',extracted:[{key:'telefono',quote:'12',value:'12'}]}));assert.equal(t.save,false);assert.equal(t.state.pending,false);assert.equal(t.state.data.telefono,undefined);
});
test('capabilities prohibit gathering disabled data',()=>{
 const t=advance({...cfg,agent:{capabilities:{can_collect_leads:false}}},initialState(),'Mario',r({action:'consent',extracted:[{key:'nome',quote:'Mario',value:'Mario'}]}));assert.deepEqual(t.state.data,{});assert.equal(t.state.pending,false);
});
for(const language of ['it','en','fr','es','de'])test('saved conversation can close in '+language,()=>{
 const s={...initialState(),saved:true,data:{nome:'Mario'}};const t=advance(cfg,s,'No thanks',r({language,action:'close'}));assert.equal(t.state.closed,true);assert.equal(t.state.language,language);assert.equal(t.save,false);
});
test('provider requires the direct Gemini key and rejects malformed output',async()=>{
 let called=0;await assert.rejects(interpret(cfg,initialState(),[],'hello',{env:{GEMINI_API_KEY:'gateway',GOOGLE_GEMINI_BASE_URL:'https://gateway.example.invalid'},transport:()=>called++}));assert.equal(called,0);
 await assert.rejects(interpret(cfg,initialState(),[],'hello',{env:{LINEA_GEMINI_API_KEY:'fake'},transport:async(url,args)=>{assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');assert.equal(JSON.parse(args.body).generationConfig.maxOutputTokens,1000);return {ok:true,json:async()=>({candidates:[]})};}}));
});

test('phone embedded in evidence sentence remains valid',()=>{
 const t=advance(cfg,initialState(),'Sono Mario e il mio numero è 3331234567.',r({extracted:[{key:'telefono',quote:'il mio numero è 3331234567',value:'3331234567'}]}));assert.equal(t.state.data.telefono,'3331234567');
});

test('name is normalized only from literal evidence; malformed items are ignored',()=>{
 const t=advance(cfg,initialState(),'Sono Mario Prova',r({extracted:[null,{key:'nome',quote:'Sono Mario Prova',value:'Mario Prova'}]}));assert.equal(t.state.data.nome,'Mario Prova');
});

test('replies never invent a name, greet by the Italian clock', async () => {
  const { polishReply, localMoment } = await import('../lib/online-ai.mjs');
  assert.equal(polishReply('Grazie, signor Rossi. Potrebbe fornirmi un recapito?', { hour: 19 }), 'Grazie. Potrebbe fornirmi un recapito?');
  assert.equal(polishReply('Buongiorno, come posso aiutarla?', { hour: 19 }), 'Buonasera, come posso aiutarla?');
  assert.equal(polishReply('Buonasera, come posso aiutarla?', { hour: 9 }), 'Buongiorno, come posso aiutarla?');
  assert.equal(polishReply('Il signore del negozio è gentile.', { hour: 9 }), 'Il signore del negozio è gentile.');
  assert.equal(localMoment(new Date('2026-09-25T17:07:00Z')).hour, 19);
  assert.equal(localMoment(new Date('2026-09-25T17:07:00Z')).part, 'sera');
});

test('a correction phrase is never saved as a name; corrections after saving update the request', () => {
  const cfg = { fields: [{ key: 'nome', label: 'Nome e cognome', required: true, kind: 'text' }, { key: 'telefono', label: 'Telefono', required: true, kind: 'phone' }] };
  const r = (extracted, extra = {}) => ({ reply: 'ok', language: 'it', action: 'continue', consent: 'none', consent_quote: '', extracted, ...extra });
  let s = initialState();
  // Il modello cita "Non mi chiamo Rossi" ma il valore non è nel messaggio: scartato.
  let t = advance(cfg, s, 'Non mi chiamo Rossi', r([{ key: 'nome', quote: 'Non mi chiamo Rossi', value: 'Francesco' }]));
  assert.equal(t.state.data.nome, undefined);
  t = advance(cfg, s, 'Non mi chiamo Rossi', r([{ key: 'nome', quote: 'Non mi chiamo Rossi', value: 'Non mi chiamo Rossi' }]));
  assert.equal(t.state.data.nome, undefined);
  t = advance(cfg, s, 'mi chiamo Francesco Floridi', r([{ key: 'nome', quote: 'mi chiamo Francesco Floridi', value: 'Francesco Floridi' }]));
  assert.equal(t.state.data.nome, 'Francesco Floridi');

  // Richiesta già salvata: il cliente corregge il nome.
  const saved = { ...initialState(), saved: true, count: 5, data: { nome: 'Francesco fl', telefono: '3297654865' } };
  t = advance(cfg, saved, 'hai sbagliato il mio nome, mi chiamo Francesco Floridi', r([{ key: 'nome', quote: 'mi chiamo Francesco Floridi', value: 'Francesco Floridi' }], { action: 'close' }));
  assert.equal(t.update, true);
  assert.equal(t.state.closed, false);
  assert.equal(t.state.data.nome, 'Francesco Floridi');
  assert.match(t.reply, /aggiornato/);
  // Un numero non valido dopo il salvataggio non cancella quello registrato.
  t = advance(cfg, saved, 'il numero è 123', r([{ key: 'telefono', quote: '123', value: '123' }]));
  assert.equal(t.state.data.telefono, '3297654865');
  // Nessun dato nuovo dopo il salvataggio.
  t = advance(cfg, saved, 'la mia email è a@b.it', r([{ key: 'email', quote: 'a@b.it', value: 'a@b.it' }]));
  assert.equal(t.update, false);
  // Non chiude se il cliente fa una domanda.
  t = advance(cfg, saved, 'grazie, ma quando mi chiamate?', r([], { action: 'close' }));
  assert.equal(t.state.closed, false);
});
