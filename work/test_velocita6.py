import sys, unittest,json,tempfile
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from bot_core import Conversazione
from sheets_store import GoogleSheets,SheetsError,HEADERS
from comprensione import Messaggio
class Tests(unittest.TestCase):
 def test_phone_and_yes_no_model(self):
  parser=Mock(side_effect=AssertionError('Non deve chiamare il modello'))
  responder=Mock(side_effect=AssertionError('Non deve generare una risposta'))
  writer=Mock();c=Conversazione(writer,parser,responder)
  c.dati={'nome':'Demo','trattamento':'Controllo','tempistica':'domani'};c.modalita='ricontatto';c.atteso='telefono'
  c.ricevi('245654709');self.assertTrue(c.consenso_chiesto)
  c.ricevi('si');self.assertTrue(c.salvato);writer.add_to_sheet.assert_called_once()
  parser.assert_not_called();responder.assert_not_called()
 def test_pure_timing_does_not_generate(self):
  parser=Mock(return_value=Messaggio.model_validate_json('{"tempistica":"il prima possibile","intento":"prenotazione"}'))
  responder=Mock();c=Conversazione(Mock(),parser,responder)
  c.dati={'trattamento':'Controllo'};c.modalita='visita';c.atteso='tempistica'
  c.ricevi('il prima possibile');responder.assert_not_called()
 @patch('sheets_http.SheetsHTTP')
 def test_append_once_raw_and_receipt(self,http):
  client=http.return_value;client.token.return_value='mock';row=['Demo','012345678','Controllo','domani','sì']
  client.values.side_effect=[{'values':[HEADERS]},{'updates':{'updatedRows':1,'updatedData':{'values':[row]},'updatedRange':'A2:E2'}}]
  store=GoogleSheets();store.configuration=lambda:{'worksheet':'Foglio1','spreadsheet_id':'demo'}
  self.assertEqual(store.add_to_sheet(dict(zip(['nome','telefono','trattamento','tempistica'],row)),True),'A2:E2')
  self.assertEqual(client.values.call_count,2);self.assertEqual(client.values.call_args.kwargs['rows'],[row])
 @patch('sheets_http.SheetsHTTP')
 def test_wrong_header_no_append(self,http):
  http.return_value.values.return_value={'values':[['wrong']]}
  store=GoogleSheets();store.configuration=lambda:{'worksheet':'Foglio1','spreadsheet_id':'demo'}
  with self.assertRaises(SheetsError):store.add_to_sheet(dict(nome='Demo',telefono='012345678',trattamento='Controllo',tempistica='domani'),True)
  self.assertEqual(http.return_value.values.call_count,1)
 @patch('sheets_http.SheetsHTTP')
 def test_no_consent_no_network(self,http):
  with self.assertRaises(SheetsError):GoogleSheets().add_to_sheet({},False)
  http.assert_not_called()
 @patch('sheets_http.SheetsHTTP')
 def test_timeout_not_retried(self,http):
  client=http.return_value;client.values.side_effect=[{'values':[HEADERS]},TimeoutError()]
  store=GoogleSheets();store.configuration=lambda:{'worksheet':'Foglio1','spreadsheet_id':'demo'}
  with self.assertRaises(TimeoutError):store.add_to_sheet(dict(nome='Demo',telefono='012345678',trattamento='Controllo',tempistica='domani'),True)
  self.assertEqual(client.values.call_count,2)
if __name__=='__main__':unittest.main()
