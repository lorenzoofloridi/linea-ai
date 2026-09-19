import sys,unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
from comprensione import Messaggio

def msg(**kw):
 d=dict(nome='',telefono='',trattamento='',tempistica='',intento='dati',emozione='neutra',domanda=False,rifiuto_dati=False,consenso='non_espresso')
 return Messaggio(**(d|kw))
class Tests(unittest.TestCase):
 def setUp(self):
  self.w=Mock();self.p=Mock();self.check=Mock(return_value='incerto')
  self.reply=Mock(side_effect=lambda t,h,s,f:f)
  self.c=Conversazione(self.w,self.p,self.reply,self.check)
 def turn(self,t,**kw):self.p.return_value=msg(**kw);return self.c.ricevi(t)
 def ready(self):
  self.turn("devo mettere l'apparecchio",trattamento="mettere l'apparecchio")
  self.check.return_value='ricontatto'
  self.turn('preferirei essere ricontattato per chiarimenti',rifiuto_dati=True)
  self.turn('tra tre giorni',tempistica='tra tre giorni')
  self.turn('Anna Demo',nome='Anna Demo')
  self.turn('+39 000 000 0000',telefono='+39 000 000 0000')
 def test_wrong_refusal_not_terminal(self):
  self.turn("apparecchio",trattamento='apparecchio')
  self.check.return_value='ricontatto'
  out=self.turn('preferirei essere ricontattato per chiarimenti',rifiuto_dati=True)
  self.assertFalse(self.c.rifiutato);self.assertFalse(self.c.terminata)
  self.assertEqual(self.c.modalita,'ricontatto');self.assertEqual(self.c.atteso,'tempistica')
 def test_unverified_refusal_clarifies(self):
  self.turn('non domani',rifiuto_dati=True)
  self.assertFalse(self.c.rifiutato);self.assertFalse(self.c.terminata);self.w.add_to_sheet.assert_not_called()
 def test_question_original_preserved(self):
  self.turn("devo mettere l'apparecchio",trattamento="mettere l'apparecchio")
  out=self.turn('se registri come ortodonzia poi il dottore capisce?',trattamento='ortodonzia',domanda=True)
  self.assertEqual(self.c.originali['trattamento'],"mettere l'apparecchio")
  self.assertNotIn('Preferisci chiedere',out)
  self.assertIn('originali',self.reply.call_args.args[2])
 def test_save_once_original_category(self):
  self.ready();self.w.add_to_sheet.assert_not_called();self.turn('yes');self.c.ricevi('si')
  self.w.add_to_sheet.assert_called_once()
  self.assertEqual(self.w.add_to_sheet.call_args.args[0]['trattamento'],"Ortodonzia — richiesta: mettere l'apparecchio")
 def test_explicit_refusal(self):
  self.ready();self.check.return_value='rifiuto';self.turn('non chiamatemi',rifiuto_dati=True)
  self.assertTrue(self.c.rifiutato);self.turn('yes');self.w.add_to_sheet.assert_not_called()
 def test_correction_new_consent(self):
  self.ready();self.turn('sì correggi il numero: 123456789',telefono='123456789',consenso='positivo')
  self.w.add_to_sheet.assert_not_called();self.turn('yes');self.w.add_to_sheet.assert_called_once()
 def test_error_no_retry(self):
  self.ready();self.w.add_to_sheet.side_effect=RuntimeError();out=self.turn('yes')
  self.assertNotIn('Ho registrato',out);self.turn('yes');self.w.add_to_sheet.assert_called_once()
 def test_after_save_context(self):
  self.ready();self.turn('yes');self.turn('quali altre date ci sono?',intento='orari',domanda=True)
  self.assertTrue(self.reply.call_args.args[2]['salvato']);self.w.add_to_sheet.assert_called_once()
 def test_conditional_not_consent(self):
  self.ready();self.turn('sì se è gratis',consenso='positivo');self.w.add_to_sheet.assert_not_called()
 def test_no_invented_fields(self):
  self.turn('ciao come va',nome='Inventato',telefono='123456789')
  self.assertEqual(self.c.dati,{})
 def test_omitted_model_fields_are_not_invented(self):
  parsed=Messaggio.model_validate_json('{"modalita":"ricontatto"}')
  self.assertEqual(parsed.modalita,'ricontatto');self.assertFalse(parsed.rifiuto_dati)
  self.assertEqual(parsed.nome,'');self.assertEqual(parsed.consenso,'non_espresso')
 def test_question_does_not_change_contact_preference(self):
  self.turn('apparecchio',trattamento='apparecchio')
  self.check.return_value='informazioni'
  self.turn('il dottore capisce?',domanda=True,modalita='informazioni')
  self.assertEqual(self.c.modalita,'');self.check.assert_not_called()
if __name__=='__main__':unittest.main()
