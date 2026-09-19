"""Contratti: flussi non lineari e confine tra conversazione e scrittura."""
import json,sys,unittest
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from bot_core import Conversazione
from comprensione import Messaggio,interpreta
from dialogo import Risposta

class Writer:
 def __init__(self,fail=False):self.rows=[];self.fail=fail
 def add_to_sheet(self,payload,consent):
  self.rows.append((payload.copy(),consent))
  if self.fail:raise RuntimeError()

def parsed(**kwargs):return Messaggio.model_validate_json(json.dumps(kwargs))
class DialogoTests(unittest.TestCase):
 def chat(self,message,reply,**kwargs):
  w=Writer();c=Conversazione(writer=w,parser=lambda *a:message,responder=lambda *a:reply,**kwargs)
  return c,w
 def complete(self,c):
  c.dati=dict(nome='Micol',telefono='3891234567',trattamento='Ortodonzia',tempistica='Da concordare')
  c.consenso_chiesto=True;c.atteso='consenso';c.storia[-1]['content']='Sei d’accordo a essere ricontattata al numero indicato?'
 def test_mixed_question_with_multiple_fields(self):
  c,w=self.chat(parsed(nome='Micol',telefono='3891234567',trattamento="mettere l’apparecchio",intento='prezzi',domanda=True),Risposta('Non ho prezzi verificati.'))
  c.ricevi('Sono Micol, vorrei mettere l’apparecchio: quanto costa? Chiamatemi al 3891234567')
  self.assertEqual(c.dati,dict(nome='Micol',telefono='3891234567',trattamento='Ortodonzia'))
  self.assertEqual(w.rows,[]);self.assertEqual(c.atteso,'')
 def test_typographic_apostrophe_preserves_original(self):
  raw=json.dumps(dict(nome='Micol',telefono='3891234567',trattamento="mettere l'apparecchio",domanda=True,intento='prezzi'))
  with patch('comprensione.ollama.Client.chat',return_value=SimpleNamespace(message=SimpleNamespace(content=raw))):
   data=interpreta('Sono Micol, vorrei mettere l’apparecchio, quanto costa? Il numero è 3891234567',{},'',[],False)
  self.assertEqual(data.trattamento,'mettere l’apparecchio')
  self.assertEqual(data.nome,'Micol')
 def test_generated_question_cannot_request_known_field(self):
  from dialogo import rispondi
  raw=json.dumps(dict(risposta='Come ti chiami?',campo_richiesto='nome',richiedi_consenso=False))
  with patch('dialogo.Client.chat',return_value=SimpleNamespace(message=SimpleNamespace(content=raw))):
   answer=rispondi('ciao',[],{'dati':{'nome':'Micol'},'campi_mancanti':['tempistica'],'raccolta_consentita':True},'Ciao Micol.')
  self.assertEqual(answer,'Ciao Micol.')
 def test_accidental_symbol_removed_but_phone_preserved(self):
  c,w=self.chat(parsed(trattamento='vorrei un apparecchio+',telefono='+393651234567',intento='dati'),Risposta(''))
  c.ricevi('vorrei un apparecchio+, il numero è +393651234567')
  self.assertEqual(c.dati['trattamento'],'Ortodonzia')
  self.assertNotIn('+',c.payload()['trattamento'])
  self.assertEqual(c.dati['telefono'],'+393651234567')
 def test_one_question_cannot_ask_two_fields(self):
  from dialogo import rispondi
  raw=json.dumps(dict(risposta='Mi dai nome e numero di telefono?',campo_richiesto='nome',richiedi_consenso=False))
  with patch('dialogo.Client.chat',return_value=SimpleNamespace(message=SimpleNamespace(content=raw))):
   answer=rispondi('sì',[],{'campi_mancanti':['nome','telefono'],'raccolta_consentita':True},'')
  self.assertEqual(answer,'Come ti chiami?')
 def test_timing_question_explicitly_means_callback(self):
  from dialogo import rispondi
  raw=json.dumps(dict(risposta='Quando vuoi ricevere informazioni?',campo_richiesto='tempistica',richiedi_consenso=False))
  with patch('dialogo.Client.chat',return_value=SimpleNamespace(message=SimpleNamespace(content=raw))):
   answer=rispondi('ciao',[],{'campi_mancanti':['tempistica'],'raccolta_consentita':True},'')
  self.assertIn('contattato dalla segreteria',answer)
 def test_no_guaranteed_callback(self):
  from dialogo import rispondi
  raw=json.dumps(dict(risposta='Ti chiameremo oggi stesso.',campo_richiesto='',richiedi_consenso=True))
  with patch('dialogo.Client.chat',return_value=SimpleNamespace(message=SimpleNamespace(content=raw))):
   answer=rispondi('oggi',[],{'campi_mancanti':[],'raccolta_consentita':True,'puo_chiedere_consenso':True},Risposta('Ti riassumo la richiesta.',richiedi_consenso=True))
  self.assertEqual(answer,'Ti riassumo la richiesta.')
 def test_visit_date_is_not_callback_preference(self):
  raw=json.dumps(dict(tempistica='domani',modalita='visita',intento='dati'))
  with patch('comprensione.ollama.Client.chat',return_value=SimpleNamespace(message=SimpleNamespace(content=raw))):
   data=interpreta('Vorrei la visita domani',{},'',[],False)
  self.assertEqual(data.tempistica,'')
 def test_no_fixed_field_order(self):
  c,w=self.chat(parsed(trattamento='sbiancamento',intento='dati'),Risposta('Come ti chiami?',campo_richiesto='nome'))
  c.ricevi('sbiancamento');self.assertEqual(c.atteso,'nome')
  self.assertNotIn('tempistica',c.dati)
 def test_no_time_is_not_refusal(self):
  c=Conversazione(writer=Writer(),parser=interpreta,responder=lambda *a:Risposta('Possiamo concordarlo più avanti.'))
  c.atteso='tempistica';c.ricevi('no')
  self.assertEqual(c.dati['tempistica'],'Da concordare');self.assertFalse(c.rifiutato)
 def test_correction_invalidates_previous_consent(self):
  c,w=self.chat(parsed(telefono='3897654321',intento='dati'),Risposta('Ho corretto il numero.',richiedi_consenso=True),consent_checker=lambda *a:True)
  self.complete(c);c.ricevi('Sì, anzi il numero è 3897654321')
  self.assertEqual(w.rows,[]);self.assertEqual(c.dati['telefono'],'3897654321');self.assertTrue(c.consenso_chiesto)
 def test_generation_failure_with_complete_data_can_request_consent(self):
  c,w=self.chat(parsed(tempistica='non ho ancora deciso quando',modalita='visita',intento='dati'),Risposta(''))
  c.dati=dict(nome='Micol',telefono='3891234567',trattamento='Ortodonzia')
  c.responder=lambda t,h,s,f:f
  answer=c.ricevi('Prima vorrei una visita, non ho ancora deciso quando.')
  self.assertIn('Sei d’accordo',answer.replace("d'accordo",'d’accordo'))
  self.assertTrue(c.consenso_chiesto);self.assertEqual(w.rows,[])
 def test_equivalent_consents_save_once(self):
  for yes in ('sono d’accordo','nessun problema','ok','certo'):
   c,w=self.chat(parsed(intento='sociale'),Risposta('Sono qui.'));self.complete(c)
   c.ricevi(yes);c.ricevi(yes);self.assertEqual(len(w.rows),1)
 def test_semantic_consent(self):
  c,w=self.chat(parsed(intento='dati',consenso='positivo'),Risposta(''),consent_checker=lambda text,prev:text=='Per me potete procedere con il ricontatto')
  self.complete(c);c.ricevi('Per me potete procedere con il ricontatto');self.assertEqual(len(w.rows),1)
 def test_question_breaks_pending_consent(self):
  c,w=self.chat(parsed(intento='privacy',domanda=True),Risposta('Il numero serve al ricontatto.'))
  self.complete(c);c.ricevi('Perché vuoi il numero?');self.assertFalse(c.consenso_chiesto)
  c.ricevi('ok');self.assertEqual(w.rows,[])
 def test_ambiguous_consent_cannot_carry_to_other_question(self):
  c,w=self.chat(parsed(consenso='incerto'),Risposta('Quale dubbio vorresti chiarire?'),consent_checker=lambda *a:False)
  self.complete(c);c.ricevi('forse');self.assertFalse(c.consenso_chiesto)
  c.ricevi('ok');self.assertEqual(w.rows,[])
 def test_refusal_no_registration(self):
  c,w=self.chat(parsed(rifiuto_dati=True,consenso='negativo'),Risposta('Possiamo continuare qui.'))
  self.complete(c);c.ricevi('Non voglio lasciare contatti');self.assertTrue(c.rifiutato);self.assertEqual(w.rows,[])
 def test_failure_never_confirms_or_retries(self):
  c,w=self.chat(parsed(intento='sociale'),Risposta('Sono qui.'));w.fail=True;self.complete(c)
  answer=c.ricevi('certo');self.assertIn('non riesco a confermare',answer);self.assertFalse(c.salvato)
  c.ricevi('certo');self.assertEqual(len(w.rows),1)
 def test_after_save_still_answers(self):
  c,w=self.chat(parsed(intento='orari',domanda=True),Risposta('Non dispongo di un calendario verificato.'));self.complete(c)
  c.ricevi('certo');answer=c.ricevi('Quali date ci sono?')
  self.assertIn('calendario',answer);self.assertEqual(len(w.rows),1)
if __name__=='__main__':unittest.main()
