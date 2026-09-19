import sys,json
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
w=Mock(); c=Conversazione(w)
for t in ['ciao','quali ci sono?','Vorrei togliere il dente del giudizio','Ho paura del dentista, mi vergogno un po\u0027','quando torno dalle ferie','Mi chiamo Anna Demo','Perché vi serve il telefono?','+39 000 000 0000','potete telefonarmi']:
 print('TU:',t,flush=True)
 print('AI:',c.ricevi(t),flush=True)
 print('DATI:',json.dumps(c.dati,ensure_ascii=False),'ATTESO:',c.atteso,flush=True)
assert c.salvato and w.add_to_sheet.call_count==1
assert c.dati['tempistica']=='quando torno dalle ferie'
assert c.dati['nome']=='Anna Demo'
print('PASS dialogo reale; scrittura Google simulata.')
