import sys,json,time
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
from comprensione import interpreta
cases=[('voglio togliere una carie','trattamento','trattamento'),('mi si è scheggiato un dente','trattamento','trattamento'),('appena riesco a liberarmi dal lavoro','tempistica','tempistica'),('non ho ancora deciso','tempistica','tempistica'),('quali ci sono?','trattamento',None)]
for text,expected,field in cases:
 p=interpreta(text,{},expected,[],False)
 print(text,p.model_dump(),flush=True)
 if field: assert getattr(p,field) and getattr(p,field) in text
 else: assert not p.trattamento and p.intento=='servizi'
w=Mock();c=Conversazione(w)
for text in ['ciao','Vorrei togliere il dente del giudizio','quando torno dalle ferie','Anna Demo','+39 000 000 0000','potete telefonarmi']:
 print(text,'->',c.ricevi(text),flush=True)
assert c.salvato and w.add_to_sheet.call_count==1
assert c.dati['tempistica']=='quando torno dalle ferie'
print('PASS: casi liberi e conversazione completa; nessun invio reale.',flush=True)
