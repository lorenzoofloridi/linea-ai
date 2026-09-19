import sys,unittest,json
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from dialogo import rispondi,verifica_scelta
class Guards(unittest.TestCase):
 def response(self,text):return SimpleNamespace(message=SimpleNamespace(content=json.dumps({'risposta':text})))
 @patch('dialogo.Client')
 def test_false_receipt_blocked(self,client):
  client.return_value.chat.return_value=self.response('La richiesta è registrata.')
  self.assertEqual(rispondi('ciao',[],{},'fallback'),'fallback')
 @patch('dialogo.Client')
 def test_keeps_explanation_drops_extra_question(self,client):
  client.return_value.chat.return_value=self.response('La categoria descrive la richiesta generale. Vuoi una visita?')
  self.assertEqual(rispondi('ciao',[],{},'fallback'),'La categoria descrive la richiesta generale.')
 @patch('dialogo.Client')
 def test_positive_choice_without_quote_not_rejected(self,client):
  client.return_value.chat.return_value=SimpleNamespace(message=SimpleNamespace(content='{"scelta":"ricontatto"}'))
  self.assertEqual(verifica_scelta('preferirei essere ricontattato'),'ricontatto')
 @patch('dialogo.Client')
 def test_negative_without_evidence_uncertain(self,client):
  client.return_value.chat.return_value=SimpleNamespace(message=SimpleNamespace(content='{"scelta":"rifiuto"}'))
  self.assertEqual(verifica_scelta('preferirei essere ricontattato'),'incerto')
 @patch('dialogo.Client')
 def test_question_uses_original_in_fallback(self,client):
  client.return_value.chat.return_value=self.response('La richiesta è registrata.')
  answer=rispondi('Il dottore capisce?',[],{'dati':{'trattamento':'Ortodonzia'},'originali':{'trattamento':"mettere l'apparecchio"}},'fallback')
  self.assertIn("mettere l'apparecchio",answer);self.assertNotIn('è registrata',answer)
if __name__=='__main__':unittest.main()
