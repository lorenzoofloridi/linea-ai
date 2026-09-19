import sys,json,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from core.lead_outbox import LeadOutbox
from providers.ollama_provider import usa_modello,modello_attivo
class Tests(unittest.TestCase):
 def test_model_override_is_scoped(self):
  original=modello_attivo()
  with usa_modello('gpt-oss:20b'):self.assertEqual(modello_attivo(),'gpt-oss:20b')
  self.assertEqual(modello_attivo(),original)
 def test_delivery_survives_restart(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'agente.db';o=LeadOutbox(path)
   identifier=o.prepare('demo','test',{'nome':'Fittizio'},'Sì')
   o.mark(identifier,'delivering');o.mark(identifier,'uncertain',error_type='TimeoutError')
   with LeadOutbox(path).connect() as db:
    row=db.execute('SELECT status,consent_evidence,source FROM lead_delivery WHERE id=?',(identifier,)).fetchone()
   self.assertEqual(row,('uncertain','Sì','test'))
   self.assertEqual(path.stat().st_mode&0o777,0o600)
 def test_no_delivery_without_consent(self):
  with tempfile.TemporaryDirectory() as tmp:
   with self.assertRaises(ValueError):LeadOutbox(Path(tmp)/'x.db').prepare('demo','test',{},'')
if __name__=='__main__':unittest.main()
