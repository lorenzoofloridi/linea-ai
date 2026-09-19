import sys
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path('outputs/mio-agente-ai').resolve()))
from bot_core import Conversazione, CONSENT
writer=Mock()
c=Conversazione(writer=writer)
for text in ['ciao','quali trattamenti ci sono?','dentale']:
 answer=c.ricevi(text)
 print(text,'->',answer)
 assert not c.dati and not c.consenso_chiesto
assert 'igiene dentale' in answer and 'controllo' in answer
for text in ['che servizi offrite?', 'quali cure avete?', 'cosa fate?']:
 assert 'faccette' in c.ricevi(text)
assert not writer.add_to_sheet.called
c.ricevi('igiene dentale')
assert c.dati['trattamento']=='igiene dentale'
for text in ['Vorrei sapere il prezzo','A breve','Paziente Demo','+39 000 000 0000']:
 c.ricevi(text)
assert c.consenso_chiesto
before=c.dati.copy()
assert CONSENT in c.ricevi('quali trattamenti ci sono?')
assert c.dati==before and not writer.add_to_sheet.called
c.ricevi('sì')
assert writer.add_to_sheet.call_count==1
c.ricevi('quali trattamenti ci sono?')
c.ricevi('sì')
assert writer.add_to_sheet.call_count==1
print('PASS: sequenza segnalata, varianti, prosecuzione, consenso e singolo salvataggio simulato.')
