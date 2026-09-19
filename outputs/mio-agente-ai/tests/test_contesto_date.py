import sys,unittest
from pathlib import Path
from datetime import datetime
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tempistiche import normalizza,ZONE
from bot_core import Conversazione
from comprensione import Messaggio
from dialogo import Risposta
import json
class Writer:
 def __init__(self):self.updated=[]
 def update_request(self,r,old,new):self.updated.append(new)
class Tests(unittest.TestCase):
 def test_calendar(self):
  now=datetime(2026,9,11,10,0,tzinfo=ZONE)
  for text,part in [('oggi','11/09/2026'),('domani pomeriggio','12/09/2026 — pomeriggio'),('dopodomani','13/09/2026'),('lunedì','14/09/2026'),('anche adesso','dal 11/09/2026 10:00'),('tra 3 giorni','14/09/2026'),('nel pomeriggio','11/09/2026 — pomeriggio')]:
   self.assertIn(part,normalizza(text,now))
  self.assertIsNone(normalizza('2026-09-10',now))
  self.assertIsNone(normalizza('oggi alle 09:00',now))
  self.assertIn('indicato il 11/09/2026',normalizza('dopo le ferie',now))
  self.assertEqual(normalizza('domani',datetime(2026,12,31,10,tzinfo=ZONE)),'01/01/2027 (Europe/Rome)')
 def test_note_and_snapshot(self):
  w=Writer();c=Conversazione(writer=w,responder=lambda *a:Risposta('Grazie a te.'))
  c.salvato=c.terminata=True;c.riga='Foglio1!A2:E2'
  c.dati={'nome':'Franco','telefono':'3128976475','trattamento':'Ortodonzia','tempistica':'12/09/2026 (Europe/Rome)'}
  c.salvato_dati=c.payload();c.proposta_nota='Informazioni su costi e modalità di pagamento'
  c.parser=lambda *a:Messaggio.model_validate_json(json.dumps({'atto':'accetta','intento':'sociale'}))
  self.assertIn('Ho aggiunto',c.ricevi('Ok'))
  self.assertEqual(len(w.updated),1)
  c.ricevi('Va bene');self.assertEqual(len(w.updated),1)
  c.parser=lambda *a:Messaggio.model_validate_json(json.dumps({'atto':'riepilogo'}))
  result=c.ricevi('Cosa hai salvato?')
  for part in ['Franco','3128976475','12/09/2026','pagamento','Consenso al contatto: sì']:self.assertIn(part,result)
 def test_failed_note_not_in_snapshot(self):
  w=Writer();w.update_request=lambda *a:(_ for _ in ()).throw(RuntimeError())
  c=Conversazione(writer=w);c.salvato_dati={'nome':'Test','telefono':'123456789','trattamento':'Ortodonzia','tempistica':'Da concordare'}
  result=c.aggiungi_nota('Costi')
  self.assertIn('non riesco',result);self.assertNotIn('Costi',c.salvato_dati['trattamento'])
  self.assertTrue(c.aggiornamento_incerto)
if __name__=='__main__':unittest.main()
