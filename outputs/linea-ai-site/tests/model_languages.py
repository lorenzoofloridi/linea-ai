import sys,tempfile,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,engine
samples=[('it','Buongiorno, vorrei informazioni sui vostri servizi.'),('en','Hello, could you tell me about your services?'),('fr','Bonjour, pourriez-vous me parler de vos services ?'),('de','Guten Tag, welche Dienstleistungen bieten Sie an?'),('es','Hola, ¿podrías explicarme qué servicios ofrecéis?')]
with tempfile.TemporaryDirectory() as temp:
 store.DB=Path(temp)/'db';store.init();access,cfg=store.start_chat('demo');row,state,cfg=store.conversation(access);report=[]
 for language,message in samples:
  start=time.monotonic()
  try:
   reply,state=engine.respond(row,state,cfg,message);row,state,cfg=store.conversation(access);result={"language":state.get("language"),"reply":reply};ok=result.get("language")==language
   item={'expected':language,'detected':result.get('language'),'ok':ok,'reply':result.get('reply'),'seconds':round(time.monotonic()-start,1)}
  except Exception as e:item={'expected':language,'ok':False,'error':type(e).__name__}
  report.append(item);print(json.dumps(item,ensure_ascii=False),flush=True)
 Path(__file__).with_name('model_languages_result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
