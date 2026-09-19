import sys,time
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
c=Conversazione(Mock());c.dati={'trattamento':'Ortodonzia'};c.originali={'trattamento':"mettere l'apparecchio"};c.modalita='visita';c.atteso='tempistica'
c.storia.append({'role':'assistant','content':'Quando pensavi di procedere?'})
for t in ['il prima possibile','Lorenzetta','245654709','si']:
 start=time.monotonic();answer=c.ricevi(t);print(t,round(time.monotonic()-start,2),answer,flush=True)
assert c.salvato and c.writer.add_to_sheet.call_count==1
print('PASS: modello reale, scrittura simulata.',flush=True)
