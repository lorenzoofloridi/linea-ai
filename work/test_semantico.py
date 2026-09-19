import sys,unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
from comprensione import Messaggio

def msg(**kw):
 d=dict(nome='',telefono='',trattamento='',tempistica='',intento='dati',emozione='neutra',domanda=False,rifiuto_dati=False,consenso='non_espresso')
 d.update(kw); return Messaggio(**d)

class TestSemantico(unittest.TestCase):
 def start(self):
  self.w=Mock(); self.p=Mock(); self.c=Conversazione(self.w,self.p,lambda t,h:'Ti ascolto, possiamo procedere con calma.')
 def turn(self,text,**kw):
  self.p.return_value=msg(**kw); return self.c.ricevi(text)
 def ready(self):
  self.turn('togliere il dente del giudizio',trattamento='togliere il dente del giudizio')
  self.turn('quando torno dalle ferie',tempistica='quando torno dalle ferie')
  self.turn('Anna Demo',nome='Anna Demo')
  self.turn('+39 000 000 0000',telefono='+39 000 000 0000')
 def test_natural_and_consent(self):
  self.start(); self.ready(); self.assertTrue(self.c.consenso_chiesto); self.w.add_to_sheet.assert_not_called()
  self.turn('forse',consenso='incerto'); self.w.add_to_sheet.assert_not_called()
  self.turn('potete telefonarmi',consenso='positivo'); self.assertTrue(self.c.salvato)
  self.c.ricevi('sì'); self.w.add_to_sheet.assert_called_once()
  self.assertEqual(self.w.add_to_sheet.call_args.args[0]['tempistica'],'quando torno dalle ferie')
 def test_fear_no_fields(self):
  self.start(); self.turn('carie',trattamento='carie'); before=self.c.dati.copy()
  out=self.turn('Ho paura',intento='sociale',emozione='paura')
  self.assertEqual(self.c.dati,before); self.assertNotIn('quando vorresti',out)
 def test_correction_new_consent(self):
  self.start(); self.ready()
  self.turn('sì, correggo il telefono: +39 111 111 1111',telefono='+39 111 111 1111',consenso='positivo')
  self.w.add_to_sheet.assert_not_called()
  self.turn('sì',consenso='positivo'); self.w.add_to_sheet.assert_called_once()
 def test_refusal(self):
  self.start(); self.ready(); self.turn('non contattatemi',consenso='negativo'); self.w.add_to_sheet.assert_not_called()
  self.turn('potete telefonarmi',consenso='positivo'); self.w.add_to_sheet.assert_not_called()
 def test_error_no_retry(self):
  self.start(); self.ready(); self.w.add_to_sheet.side_effect=RuntimeError('network')
  out=self.turn('sì',consenso='positivo'); self.assertFalse(self.c.salvato); self.assertNotIn('Ho registrato',out)
  self.c.ricevi('sì'); self.w.add_to_sheet.assert_called_once()
 def test_unquoted_invention(self):
  self.start(); self.turn('Ho paura',nome='Anna',telefono='123456789',trattamento='impianto',tempistica='domani')
  self.assertEqual(self.c.dati,{})
 def test_question_not_data(self):
  self.start(); self.turn('quanto dura uno sbiancamento?',trattamento='sbiancamento',tempistica='quanto dura',intento='medico',domanda=True)
  self.assertNotIn('tempistica',self.c.dati)
 def test_conditional_consent(self):
  self.start(); self.ready(); self.turn('sì se non mi vendete nulla',consenso='positivo'); self.w.add_to_sheet.assert_not_called()
 def test_consent_exact_phrase_even_if_model_uncertain(self):
  self.start(); self.ready(); self.turn('potete telefonarmi',consenso='non_espresso')
  self.w.add_to_sheet.assert_called_once()
 def test_multiple_data_skip_known_fields(self):
  self.start()
  out=self.turn('Sono Anna Demo, vorrei togliere una carie dopo le ferie',nome='Anna Demo',trattamento='togliere una carie',tempistica='dopo le ferie')
  self.assertEqual(self.c.atteso,'telefono'); self.assertNotIn('Quando',out)
 def test_greeting_does_not_collect(self):
  self.start(); out=self.c.ricevi('ciao')
  self.assertEqual(self.c.dati,{}); self.p.assert_not_called()
if __name__=='__main__': unittest.main()
