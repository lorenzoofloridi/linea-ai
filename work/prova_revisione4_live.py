import sys
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
w=Mock();c=Conversazione(w)
for t in ['ciao chi sei?',"mi devo mettere l'apparecchio",'preferisco una visita','dopodomani','anzi voglio tra tre giorni','Lorenzina','145756987','yes','si ho altre domande come quali altre date ci sono?']:
 r=c.ricevi(t);print(t,'->',r,'DATI',c.dati,'MODALITA',c.modalita,flush=True)
 if t=='ciao chi sei?':assert 'Clinica Demo Sorriso' in r
 if 'apparecchio' in t:assert c.dati.get('trattamento')=='Ortodonzia'
 if t=='preferisco una visita':assert c.modalita=='visita' and c.dati.get('trattamento')=='Ortodonzia'
 if t=='anzi voglio tra tre giorni':assert c.dati['tempistica']=='tra tre giorni'
 if t=='yes':assert c.salvato
 if 'altre date' in t:assert 'disponibilità' in r
assert w.add_to_sheet.call_count==1
print('PASS: conversazione modello reale, Sheets simulato.',flush=True)
