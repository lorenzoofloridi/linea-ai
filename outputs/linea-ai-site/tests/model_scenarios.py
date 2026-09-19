"""Prova del modello reale, archivi temporanei e nessuna email o invio Google."""
import sys,tempfile,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,engine
report=[]
with tempfile.TemporaryDirectory() as tmp:
 store.DB=Path(tmp)/'trial.sqlite3';store.init()
 auth=store.register('model@example.invalid','Model-test-only-123','Immobiliare Prova')
 cid=store.principal(auth)['company_id'];cfg=store.company(cid)['config'];cfg['sector']='Immobiliare';cfg['fields'] += [store.field('budget','Budget'),store.field('zona','Zona')];store.save_config(cid,cfg)
 access,_=store.start_chat(store.company(cid)['public_id'])
 for msg in ['Sono Alex Rossi, cerco un trilocale in centro, budget 280000 euro. Il numero è +44 20 8366 1177. Preferisco essere contattato domani.','Non voglio aggiungere altro, potete procedere.','Sì, autorizzo il contatto al numero indicato.','No grazie.']:
  row,state,cfg=store.conversation(access);t=time.monotonic();
  def parser(*args):
   result=engine.interpret(*args);print('INTERPRETATION '+json.dumps(result,ensure_ascii=False),flush=True);return result
  reply,state=engine.respond(row,state,cfg,msg,parser);item=dict(user=msg,reply=reply,seconds=round(time.monotonic()-t,1),data=state['data'],saved=state['saved'],closed=state['closed']);report.append(item);print(json.dumps(item,ensure_ascii=False),flush=True)
 Path('tests/model_scenarios_result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 assert len(store.list_leads(cid))==1,'Richiesta non completata'
 assert state['closed'],'Chiusura non compresa'
 assert state['data'].get('budget') and state['data'].get('zona'),'Campi dinamici non acquisiti'
 print('SCENARIO COMPLETATO',flush=True)
