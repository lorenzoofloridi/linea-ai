"""Prova reale del modello con archivio simulato: nessun dato inviato a Google."""
import sys,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bot_core import Conversazione
class Archivio:
 def __init__(self):self.updates=[]
 def update_request(self,row,previous,updated):self.updates.append(updated.copy())
a=Archivio();c=Conversazione(writer=a)
c.dati={'nome':'Franco','telefono':'0000000001','trattamento':'Ortodonzia','tempistica':'13/09/2026 (Europe/Rome)'}
c.salvato=c.terminata=True;c.riga='Test!A2:E2';c.salvato_dati=c.payload()
c.storia=[{'role':'assistant','content':'Grazie, Franco. Ho registrato la tua richiesta per la segreteria. Hai altre domande?'}]
report=[]
for message in ['Come funziona per il pagamento?','Ok','Quindi cosa hai salvato?','Va bene, grazie.']:
 t=time.monotonic();reply=c.ricevi(message)
 item={'user':message,'assistant':reply,'seconds':round(time.monotonic()-t,2),'updates':len(a.updates)};report.append(item);print(json.dumps(item,ensure_ascii=False),flush=True)
Path('evals/seguito-qwen-20260912.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
assert len(a.updates)==1
assert 'pagamento' in c.salvato_dati['trattamento'].lower()
assert 'Franco' in report[2]['assistant'] and '0000000001' in report[2]['assistant']
assert 'non sono sicuro' not in report[3]['assistant'].lower()
