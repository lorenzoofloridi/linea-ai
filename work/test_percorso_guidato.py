import sys
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path('outputs/mio-agente-ai').resolve()))
from bot_core import Conversazione
writer=Mock(); c=Conversazione(writer=writer)
with patch('bot_core.estrai_modello',side_effect=AssertionError('Non serve AI per questi messaggi')):
 for t in ['ciao','quali','sbiancamento dentale','sbiancamento dentale','a lungo periodo','Lorenzo','234565476','si','grazie']:
  r=c.ricevi(t); print(t,'->',r)
  if t=='sbiancamento dentale':
   assert c.atteso=='tempistica' and 'Cosa vorresti sapere' not in r
  if t=='234565476': assert 'Lorenzo' in r and 'a lungo periodo' in r
  if t=='si': assert 'Hai altre domande?' in r
 assert writer.add_to_sheet.call_count==1
 assert writer.add_to_sheet.call_args.args[0]['tempistica']=='a lungo periodo'
 assert writer.add_to_sheet.call_args.args[0]['telefono']=='234565476'
print('PASS: percorso completo segnalato e chiusura, nessuna scrittura Google.')
