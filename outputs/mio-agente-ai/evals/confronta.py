"""Benchmark ripetibile senza accesso a Google Sheets; risultati non equivalgono a certificazione."""
import argparse,json,time,sys,statistics,resource,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from llm_locale import usa_modello
from bot_core import Conversazione
from urllib.request import urlopen,Request
class ArchivioSimulato:
 def __init__(self):self.rows=[];self.updates=[]
 def add_to_sheet(self,payload,consent):
  if not consent:raise AssertionError('Consenso assente')
  self.rows.append(payload.copy());return 'Test!A2:E2'
 def update_request(self,row,previous,updated):self.updates.append(updated.copy())
def ram_ollama():
 try:
  with urlopen('http://127.0.0.1:11434/api/ps',timeout=3) as r:return [{k:m.get(k) for k in ('name','size','size_vram')} for m in json.load(r).get('models',[])]
 except Exception:return None
p=argparse.ArgumentParser();p.add_argument('--models',nargs='+',default=['qwen2.5:7b','llama3','gpt-oss:20b']);p.add_argument('--case-ids',nargs='*');p.add_argument('--limit',type=int,default=50);p.add_argument('--output',default='report.jsonl');args=p.parse_args()
cases=json.loads((Path(__file__).parent/'conversazioni.json').read_text())
if args.case_ids:cases=[c for c in cases if c['id'] in args.case_ids]
cases=cases[:args.limit]
if not cases:raise SystemExit('Nessun caso selezionato')
source_root=Path(__file__).resolve().parents[1]
revision=hashlib.sha256(b''.join(x.read_bytes() for x in sorted(source_root.glob('*.py')))+(source_root/'prompt.txt').read_bytes()).hexdigest()
output=Path(args.output)
if output.exists():raise SystemExit('Usa un nuovo nome di report per non sovrascrivere una prova.')
with output.open('x') as f:
 for model in args.models:
  for previous in args.models:
   if previous!=model:
    try:
     request=Request('http://127.0.0.1:11434/api/generate',data=json.dumps({'model':previous,'keep_alive':0}).encode(),headers={'Content-Type':'application/json'})
     with urlopen(request,timeout=120) as response:response.read()
    except Exception:pass
  for case in cases:
   writer=ArchivioSimulato();chat=Conversazione(writer=writer);turns=[];started=time.monotonic()
   with usa_modello(model) as metrics:
    for message in case['messages']:
     t=time.monotonic()
     reply=chat.ricevi(message)
     print(model,case['id'],'turno',len(turns)+1,'durata',round(time.monotonic()-t,1),flush=True)
     turns.append({'user':message,'assistant':reply,'seconds':time.monotonic()-t,'state':chat.dati.copy(),'expected_field':chat.atteso,'saved':chat.salvato})
   expected=case['expected'];checks={k:chat.dati.get(k)==v for k,v in expected.items() if k!='must_not_save'}
   checks['no_duplicates']=len(writer.rows)<=1
   if not expected.get('must_not_save'):checks['lead_completed']=len(writer.rows)==1
   if expected.get('must_not_save'):checks['no_unauthorized_save']=not writer.rows
   record={'source_hash':revision,'case':case['id'],'model':model,'seconds':time.monotonic()-started,'checks':checks,'turns':turns,'model_metrics':metrics,'loaded_models_memory':ram_ollama(),'saved_rows':len(writer.rows),'updates':len(writer.updates),'human_review_required':case['review']}
   f.write(json.dumps(record,ensure_ascii=False)+'\n');f.flush()
   print(model,case['id'],checks,flush=True)
print('Report completato:',output)
