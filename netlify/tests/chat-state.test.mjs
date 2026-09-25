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
