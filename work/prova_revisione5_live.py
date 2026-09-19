import sys,json
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
w=Mock();c=Conversazione(w)
turns=["devo mettere l'apparecchio",'se registri come ortodonzia poi il dottore capisce quello che mi serve?',
'preferirei essere ricontattato per chiarimenti','quando torno dalle ferie','Anna Demo','+39 000 000 0000','yes',
'si ho altre domande, quali altre date ci sono?']
for i,t in enumerate(turns):
 r=c.ricevi(t);print('UTENTE:',t,'\nBOT:',r,'\nSTATO:',json.dumps(c.dati,ensure_ascii=False),c.modalita,c.rifiutato,flush=True)
 if i==1:
  assert c.dati.get('trattamento')=='Ortodonzia'
  assert 'Non ho informazioni verificate sufficienti' not in r
  assert 'è registrata' not in r
  assert 'apparecchio' in r
 if i==2: assert c.modalita=='ricontatto' and not c.rifiutato and not c.terminata
 if i==6:assert c.salvato
assert w.add_to_sheet.call_count==1
assert 'apparecchio' in w.add_to_sheet.call_args.args[0]['trattamento']
print('PASS: dialogo completo modello reale, Google simulato.',flush=True)
