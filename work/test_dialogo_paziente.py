import sys
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0,str(Path('outputs/mio-agente-ai').resolve()))
from bot_core import Conversazione, CONSENT
w=Mock(); c=Conversazione(writer=w)
with patch('bot_core.estrai_modello', side_effect=AssertionError('Unexpected extraction fallback')):
 for t in ['ciao','quali ci sono?']:
  r=c.ricevi(t); print(t,'->',r)
 assert 'sbiancamento' in r and not c.dati
 r=c.ricevi('Quanto costa lo sbiancamento?')
 assert c.dati['trattamento']=='sbiancamento' and 'listino' in r and c.atteso=='tempistica'
 c.ricevi('A breve')
 assert c.atteso=='nome'
 r=c.ricevi('Dove siete?')
 assert 'indirizzo' in r and c.atteso=='nome' and 'nome' not in c.dati
 c.ricevi('Paziente Demo')
 r=c.ricevi('Perché volete il telefono?')
 assert 'ricontatto' in r and c.atteso=='telefono' and 'telefono' not in c.dati
 c.ricevi('+39 000 000 0000')
 assert c.consenso_chiesto
 r=c.ricevi('Dove salvate i dati?')
 assert 'foglio Google' in r and CONSENT in r and not w.add_to_sheet.called
 c.ricevi('no')
 c.ricevi('Quali servizi offrite?')
 assert not w.add_to_sheet.called
 w2=Mock(); d=Conversazione(writer=w2)
 for t in ['Vorrei informazioni su igiene dentale','Vorrei sapere il prezzo','A breve','Paziente Demo','+39 000 000 0000','sì','sì']:
  d.ricevi(t)
 assert w2.add_to_sheet.call_count==1
print('PASS: domande contestuali, interruzioni, campi invariati, rifiuto e singolo invio simulato.')
