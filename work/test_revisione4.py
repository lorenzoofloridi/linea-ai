import sys, unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione, catalogo
from comprensione import Messaggio

def message(**kw):
 d=dict(nome='',telefono='',trattamento='',tempistica='',intento='dati',emozione='neutra',domanda=False,rifiuto_dati=False,consenso='non_espresso')
 return Messaggio(**(d|kw))
class Checks(unittest.TestCase):
 def setUp(self):
  self.w=Mock();self.p=Mock();self.c=Conversazione(self.w,self.p,lambda t,h:'Ti ascolto.')
 def turn(self,t,**kw):
  self.p.return_value=message(**kw); return self.c.ricevi(t)
 def ready(self,modalita='ricontatto'):
  self.turn('per sbiancamento',trattamento='per sbiancamento')
  self.turn(modalita,modalita=modalita)
  self.turn('dopodomani',tempistica='dopodomani')
  self.turn('anzi tra tre giorni',tempistica='tra tre giorni')
  self.turn('Lorenzina',nome='Lorenzina')
  self.turn('145756987',telefono='145756987')
 def test_yes_and_followup(self):
  self.ready();self.assertEqual(self.c.dati['trattamento'],'Sbiancamento dentale')
  self.assertEqual(self.c.dati['tempistica'],'tra tre giorni')
  self.turn('yes');self.assertTrue(self.c.salvato);self.assertFalse(self.c.consenso_chiesto)
  out=self.turn('si ho altre domande, quali altre date ci sono?',intento='orari',domanda=True)
  self.assertIn('disponibilità',out);self.w.add_to_sheet.assert_called_once()
 def test_choice_before_contacts(self):
  out=self.turn("mi devo mettere l'apparecchio",trattamento="mettere l'apparecchio")
  self.assertEqual(self.c.dati['trattamento'],'Ortodonzia');self.assertEqual(self.c.atteso,'modalita')
  self.assertIn('visita oppure',out);self.assertNotIn('Come ti chiami',out)
 def test_no_empty_ack(self):
  self.c.terminata=True
  out=self.turn('messaggio non chiaro');self.assertIn('spiegarmi meglio',out)
 def test_no_conditional_save(self):
  self.ready();self.turn('yes if it is free',consenso='positivo');self.w.add_to_sheet.assert_not_called()
 def test_no_consent_before_prompt(self):
  self.turn('yes',consenso='positivo');self.w.add_to_sheet.assert_not_called()
 def test_correction(self):
  self.ready();self.turn('si, nuovo numero 12345678',telefono='12345678',consenso='positivo')
  self.w.add_to_sheet.assert_not_called();self.turn('yes');self.w.add_to_sheet.assert_called_once()
 def test_refusal(self):
  self.ready();self.turn('no',consenso='negativo');self.turn('yes');self.w.add_to_sheet.assert_not_called()
 def test_error_single_attempt(self):
  self.ready();self.w.add_to_sheet.side_effect=RuntimeError()
  out=self.turn('yes');self.assertNotIn('Ho registrato',out);self.turn('yes');self.w.add_to_sheet.assert_called_once()
 def test_visit_request(self):
  self.ready('visita');self.turn('yes');payload=self.w.add_to_sheet.call_args.args[0]
  self.assertEqual(payload['trattamento'],'Sbiancamento dentale — richiesta di visita')
 def test_information_only(self):
  self.turn('sbiancamento',trattamento='sbiancamento')
  out=self.turn('solo informazioni',modalita='informazioni')
  self.assertNotIn('telefono',out);self.w.add_to_sheet.assert_not_called()
if __name__=='__main__':unittest.main()
