import sys
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path('outputs/mio-agente-ai').resolve()))
from bot_core import Conversazione, Estrazione
with patch('bot_core.estrai_modello',side_effect=AssertionError('Unnecessary model call')):
 for trattamento in ['togliere una carie','curare la carie','ho una carie','otturazione']:
  for tempo in ['breve','lungo','nel breve periodo','a lungo periodo','nel lungo termine','fra qualche mese','tra due settimane','non so','da decidere','il prima possibile','domani']:
   w=Mock(); c=Conversazione(writer=w)
   c.ricevi(trattamento)
   assert c.dati.get('trattamento') and c.atteso=='tempistica',(trattamento,c.dati)
   r=c.ricevi(tempo)
   assert c.dati.get('tempistica') and c.atteso=='nome',(tempo,r)
   remembered=c.dati['tempistica']
   # Changing/repeating a treatment must not reset timing or turn it into a name.
   c.ricevi('sbiancamento dentale')
   assert c.dati['tempistica']==remembered and c.atteso=='nome'
   assert 'nome' not in c.dati
   c.ricevi('Paziente Demo'); c.ricevi('+39 000 000 0000')
   assert c.consenso_chiesto and not w.add_to_sheet.called
   c.ricevi('sì'); c.ricevi('sì')
   assert w.add_to_sheet.call_count==1
 c=Conversazione(writer=Mock())
 for text in ['togliere una carie','togliere una carie','sbiancamento dentale','lungo','Lorenzo']:
  print(text,'->',c.ricevi(text))
 assert c.atteso=='telefono'
print('PASS: 44 percorsi, cambio trattamento, dati conservati, consenso e singolo invio simulato.')
