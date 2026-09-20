import unittest,tempfile,sys,json,io,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,engine,mail,api
class PlatformTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.original=store.DB;store.DB=Path(self.tmp.name)/'test.sqlite3';store.init();api.RATES.clear()
  self.a=store.register('a@example.invalid','A-test-password-123','Azienda A');self.b=store.register('b@example.invalid','B-test-password-123','Azienda B')
  self.ca=store.principal(self.a)['company_id'];self.cb=store.principal(self.b)['company_id']
  from account_fixtures import verify_session
  verify_session(self.a);verify_session(self.b)
  from saas.subscriptions import start_demo
  start_demo(store.principal(self.a));start_demo(store.principal(self.b))
 def tearDown(self):store.DB=self.original;self.tmp.cleanup()
 def request(self,path,session='',body=None):
  from types import SimpleNamespace
  raw=json.dumps(body or {}).encode();h=SimpleNamespace(path=path,command='POST' if body is not None else 'GET',client_address=('127.0.0.1',1),headers={'Cookie':'linea_session='+session,'Content-Type':'application/json','Content-Length':str(len(raw))},rfile=io.BytesIO(raw))
  return api.handle(h)
 def saved(self,cid):
  access,_=store.start_chat(store.company(cid)['public_id']);row,state,cfg=store.conversation(access)
  state['data']={'nome':'Cliente Prova','telefono':'+393123456789','interesse':'Preventivo'};state['saved']=True
  lead={'data':state['data'],'display':state['data'],'consent':'sì'};store.persist_turn(row,state,'Sì','Registrato',lead)
  return access,row,state
 def test_tenant_isolation_read_write_and_history(self):
  access,row,state=self.saved(self.ca);lid=state['lead_id']
  self.assertEqual(len(store.list_leads(self.ca)),1);self.assertEqual(store.list_leads(self.cb),[])
  for path in ['/api/leads/'+lid,'/api/conversations/'+row['id']]:self.assertEqual(self.request(path,self.b)[0],404)
  self.assertEqual(self.request('/api/leads/'+lid,self.b,{'status':'Completata','company_id':self.ca})[0],404)
  self.assertEqual(store.lead_detail(self.ca,lid)['status'],'Nuova')
  self.assertEqual(self.request('/api/leads?company_id='+self.ca,self.b)[1]['leads'],[])
  self.assertEqual(self.request('/api/config',self.b,dict(store.company(self.cb)['config'],company_id=self.ca))[0],200)
  self.assertEqual(store.company(self.ca)['config']['name'],'Azienda A')
 def test_foreign_key_rejects_cross_company_messages(self):
  _,row,_=self.saved(self.ca)
  import sqlite3
  with self.assertRaises(sqlite3.IntegrityError):
   with store.connection() as d:d.execute('INSERT INTO messages VALUES (?,?,?,?,?,?)',(self.cb,row['id'],999,'user','wrong',store.now()))
 def test_auth_password_hash_expiry_logout(self):
  self.assertEqual(self.request('/api/leads')[0],401)
  with self.assertRaises(ValueError):store.login('a@example.invalid','wrong-password')
  with store.connection() as d:
   self.assertNotIn('A-test-password',d.execute('SELECT password FROM users WHERE company_id=?',(self.ca,)).fetchone()[0])
   d.execute('UPDATE auth_sessions SET expires=0 WHERE hash=?',(store.digest(self.a),))
  self.assertEqual(self.request('/api/me',self.a)[0],401)
  store.logout(self.b);self.assertEqual(self.request('/api/me',self.b)[0],401)
 def test_duplicate_registration_rollback(self):
  with self.assertRaises(ValueError):store.register('a@example.invalid','another-password-123','Ghost')
  with store.connection() as d:self.assertEqual(d.execute('SELECT COUNT(*) FROM companies').fetchone()[0],3)
 def test_phone_metadata(self):
  self.assertIsNone(engine.phone('12345'));self.assertIsNone(engine.phone('+39 000 000 0000'))
  self.assertIsNotNone(engine.phone('+44 20 8366 1177'));self.assertIsNotNone(engine.phone('02 3661 8300'))
 def test_dynamic_config_preserved_per_session(self):
  cfg=store.company(self.ca)['config'];cfg['fields'].append(store.field('budget','Budget'))
  store.save_config(self.ca,cfg);access,_=store.start_chat(store.company(self.ca)['public_id'])
  cfg['name']='Nome nuovo';store.save_config(self.ca,cfg)
  self.assertEqual(store.conversation(access)[2]['name'],'Azienda A')
  self.assertIn('budget',[f['key'] for f in store.conversation(access)[2]['fields']])
 def test_consent_validates_and_persists_once(self):
  access,_=store.start_chat(store.company(self.ca)['public_id']);row,state,cfg=store.conversation(access)
  state['data']={'nome':'Prova','telefono':'+442083661177','interesse':'Servizio','tempistica':'Da concordare'};state['pending']=True
  parse=lambda *args:{'updates':[],'consent':'positive','consent_quote':'sì','action':'continue','reply':'','question_field':''}
  reply,state=engine.respond(row,state,cfg,'sì',parse)
  self.assertTrue(state['saved']);self.assertIn('Posso aiutarti con altro?',reply);self.assertEqual(len(store.list_leads(self.ca)),1)
  row,state,cfg=store.conversation(access)
  reply,state=engine.respond(row,state,cfg,'No grazie',lambda *a:{'action':'close'})
  self.assertTrue(state['closed']);self.assertEqual(len(store.list_leads(self.ca)),1)
 def test_no_implicit_consent_or_invalid_phone(self):
  access,_=store.start_chat(store.company(self.ca)['public_id']);row,state,cfg=store.conversation(access)
  parse=lambda *a:{'updates':[{'key':'telefono','value':'12345','quote':'12345'}],'consent':'positive','consent_quote':'sì','action':'consent'}
  reply,state=engine.respond(row,state,cfg,'sì 12345',parse)
  self.assertIn('non sembra essere valido',reply);self.assertFalse(state['saved']);self.assertEqual(store.list_leads(self.ca),[])
 def test_post_save_note_updates_same_lead(self):
  access,row,state=self.saved(self.ca);cfg=store.conversation(access)[2]
  parse=lambda *a:{'note':'Informazioni sul pagamento','note_quote':'Aggiungi la domanda sul pagamento','action':'continue','reply':'Certo.'}
  engine.respond(row,state,cfg,'Aggiungi la domanda sul pagamento',parse)
  leads=store.list_leads(self.ca);self.assertEqual(len(leads),1);self.assertIn('pagamento',leads[0]['summary'])
 def test_email_outbox_idempotency_and_failure(self):
  old=mail.CONFIG;mail.CONFIG=Path(self.tmp.name)/'missing.json'
  try:
   self.assertEqual(mail.enqueue(self.ca,'test','a@example.invalid','Test','Body'),'not_configured')
   mail.enqueue(self.ca,'test','a@example.invalid','Test','Body')
   self.assertEqual(mail.status(self.ca)['counts'],{'not_configured':1})
   self.assertTrue(mail.deliver_one(sender=lambda row:None))
   self.assertEqual(mail.status(self.ca)['counts'],{'sent':1})
   self.assertEqual(mail.status(self.cb)['counts'],{})
   mail.enqueue(self.ca,'second','a@example.invalid','Test','Body')
   def fail(row):raise TimeoutError()
   mail.deliver_one(sender=fail)
   self.assertEqual(mail.status(self.ca)['counts']['uncertain'],1)
   self.assertFalse(mail.deliver_one(sender=lambda row:None))
  finally:mail.CONFIG=old
 def test_reset_single_use_expiry_and_session_revocation(self):
  user,value=store.create_reset('a@example.invalid')
  with store.connection() as d:self.assertNotEqual(d.execute('SELECT hash FROM password_resets').fetchone()[0],value)
  store.reset_password(value,'New-password-for-tests-123')
  with self.assertRaises(store.Unauthorized):store.principal(self.a)
  with self.assertRaises(ValueError):store.reset_password(value,'Again-password-for-tests-123')
  session=store.login('a@example.invalid','New-password-for-tests-123');self.assertEqual(store.principal(session)['company_id'],self.ca)
  _,expired=store.create_reset('a@example.invalid')
  with store.connection() as d:d.execute('UPDATE password_resets SET expires=0')
  with self.assertRaises(ValueError):store.reset_password(expired,'Another-password-for-tests-123')
  self.assertIsNone(store.create_reset('missing@example.invalid'))
 def test_export_delete_isolation_and_atomic_removal(self):
  _,row,state=self.saved(self.ca);self.saved(self.cb)
  self.assertEqual(len(store.export_company(self.ca)['leads']),1)
  self.assertEqual(self.request('/api/data-delete',self.b,{'conversation':row['id'],'confirm':True})[0],404)
  self.assertEqual(self.request('/api/data-delete',self.a,{'conversation':row['id'],'confirm':True})[0],200)
  self.assertEqual(store.export_company(self.ca)['messages'],[]);self.assertEqual(store.list_leads(self.ca),[])
  self.assertEqual(len(store.list_leads(self.cb)),1)
 def test_rejects_malformed_extraction_and_unproven_decline(self):
  access,_=store.start_chat(store.company(self.ca)['public_id']);row,state,cfg=store.conversation(access)
  cfg['fields'].append(store.field('zona','Zona'))
  parser=lambda *a:{'updates':[{'key':'zona','quote':'altro','value':'non specificata)}], '}],'consent':'negative','consent_quote':'','reply':'Certo.','question_field':''}
  _,state=engine.respond(row,state,cfg,'Non voglio aggiungere altro',parser)
  self.assertNotIn('zona',state['data']);self.assertFalse(state.get('declined'))
 def test_operator_invites_bind_existing_company_and_cannot_replay(self):
  from saas import companies
  cid=companies.create('Gestita dal team')
  with self.assertRaises(ValueError):companies.invite(cid,'staff@example.invalid')
  companies.verify(cid);value=companies.invite(cid,'staff@example.invalid')
  session=companies.accept_invite(value,'Invitation-password-123')
  self.assertEqual(store.principal(session)['company_id'],cid)
  with self.assertRaises(ValueError):companies.accept_invite(value,'Invitation-password-123')
  value=companies.invite(cid,'second@example.invalid')
  with store.connection() as d:d.execute('UPDATE company_invites SET expires=0')
  with self.assertRaises(ValueError):companies.accept_invite(value,'Invitation-password-123')
  self.assertFalse(companies.overview(self.ca)['verified'])
 def test_reviewed_knowledge_and_version_snapshot(self):
  from saas import companies
  k=companies.add_knowledge(self.ca,'public','Orario da verificare','https://example.invalid/orari')
  private=companies.add_knowledge(self.ca,'private','Solo per gli amministratori','Colloquio aziendale')
  companies.review_knowledge(self.ca,private,'Solo per gli amministratori',False)
  access,_=store.start_chat(store.company(self.ca)['public_id'])
  self.assertNotIn('Orario da verificare',store.conversation(access)[2]['knowledge'])
  companies.review_knowledge(self.ca,k,'Orario verificato',True)
  new,cfg=store.start_chat(store.company(self.ca)['public_id'])
  self.assertIn('Orario verificato',cfg['knowledge']);self.assertNotIn('amministratori',cfg['knowledge'])
  self.assertNotIn('Orario verificato',store.conversation(access)[2]['knowledge'])
  self.assertGreater(cfg['config_version'],store.conversation(access)[2]['config_version'])
  other,_=store.start_chat(store.company(self.cb)['public_id'])
  self.assertNotIn('Orario verificato',store.conversation(other)[2]['knowledge'])
  with self.assertRaises(store.Missing):companies.review_knowledge(self.cb,k,'Intrusione',True)
 def test_installation_tickets_are_scoped_single_use_expiring_revocable(self):
  from saas import companies
  companies.verify(self.ca);companies.verify(self.cb)
  a=companies.installation(self.ca,'http://127.0.0.1:9000');b=companies.installation(self.cb,'https://example.invalid')
  ticket=companies.issue_ticket(a)
  self.assertEqual(self.request('/api/installation-session',body={'installation':b,'ticket':ticket,'company_id':self.ca})[0],404)
  code,result=self.request('/api/installation-session',body={'installation':a,'ticket':ticket,'company_id':self.cb})
  self.assertEqual(code,201);access=result['session'];self.assertEqual(store.conversation(access)[0]['company_id'],self.ca)
  self.assertEqual(self.request('/api/installation-session',body={'installation':a,'ticket':ticket})[0],404)
  expired=companies.issue_ticket(a)
  with store.connection() as d:d.execute('UPDATE installation_tickets SET expires=0')
  with self.assertRaises(store.Missing):companies.start_installation(a,expired)
  companies.revoke(a)
  with self.assertRaises(store.Missing):store.conversation(access)
  with self.assertRaises(store.Missing):companies.issue_ticket(a)
 def test_company_preview_requires_owner_and_reviews_are_scoped(self):
  public=store.company(self.ca)['public_id']
  for route in ('/api/public','/api/session'):
   self.assertEqual(self.request(route,body={'company':public})[0],401)
   self.assertEqual(self.request(route,self.b,{'company':public})[0],404)
   self.assertIn(self.request(route,self.a,{'company':public})[0],(200,201))
  _,row,state=self.saved(self.ca)
  self.assertEqual(self.request('/api/company-review',self.b,{'conversation':row['id'],'comment':'No'})[0],404)
  self.assertEqual(self.request('/api/company-review',self.a,{'conversation':row['id'],'comment':'Richiesta interessante'})[0],200)
  self.assertEqual(self.request('/api/company-overview',self.b)[1]['reviews'],[])
  data=self.request('/api/company-overview',self.a)[1]
  self.assertEqual(data['reviews'][0]['comment'],'Richiesta interessante');self.assertEqual(data['statistics']['leads'],1)
  store.delete_conversation(self.ca,row['id']);self.assertEqual(self.request('/api/company-overview',self.a)[1]['reviews'],[])
 def test_migration_is_repeatable_and_preserves_existing_data(self):
  self.saved(self.ca);store.init();store.init()
  self.assertEqual(len(store.list_leads(self.ca)),1);self.assertEqual(store.principal(self.a)['company_id'],self.ca)

 def test_services_demo_email_only_and_consent(self):
  access,_=store.start_chat('demo');row,state,cfg=store.conversation(access)
  self.assertEqual(cfg['name'],'Servizi Linea AI')
  self.assertEqual({f['key'] for f in cfg['fields']},{'nome','email','interesse'})
  self.assertFalse(cfg['agent']['capabilities']['can_request_phone'])
  self.assertIn('telefono',{f['key'] for f in store.company(self.ca)['config']['fields']})
  state['data']={'nome':'Test','email':'test@example.invalid','interesse':'Supporto'}
  reply,state=engine.respond(row,state,cfg,'Vorrei il supporto',lambda *a:{'action':'consent','reply':'','extracted':{}})
  self.assertIn('via email',reply);self.assertNotIn('numero indicato',reply)
  reply,state=engine.respond(row,state,cfg,'sì',lambda *a:{'action':'continue','consent':'positive','consent_quote':'sì','extracted':{}})
  self.assertTrue(state['saved']);self.assertEqual(len(store.list_leads('demo')),1)
  self.assertEqual(store.list_leads(self.ca),[])

 def test_excel_export_isolated_and_safe(self):
  import zipfile,io,xml.etree.ElementTree as ET
  self.saved(self.ca)
  code,body=self.request('/api/data-export.xlsx',self.a)
  self.assertEqual(code,200)
  with zipfile.ZipFile(io.BytesIO(body)) as z:
   for name in z.namelist():
    if name.endswith('.xml'):ET.fromstring(z.read(name))
   self.assertIn(b'Cliente Prova',z.read('xl/worksheets/sheet2.xml'))
   self.assertNotIn(b'<f>',z.read('xl/worksheets/sheet2.xml'))
  code,body=self.request('/api/data-export.xlsx',self.b)
  with zipfile.ZipFile(io.BytesIO(body)) as z:self.assertNotIn(b'Cliente Prova',z.read('xl/worksheets/sheet2.xml'))
  self.assertEqual(self.request('/api/data-export.xlsx')[0],401)

 def test_ten_digit_phone_without_prefix(self):
  for number in ['3123456789','1234567890','0212345678']:
   self.assertEqual(engine.phone(number),number)
  self.assertEqual(engine.phone('312 345 6789'),'3123456789')
  self.assertIsNone(engine.phone('12345'))
  self.assertIsNone(engine.phone('312abc6789'))
  self.assertIsNotNone(engine.phone('+44 20 8366 1177'))

if __name__=='__main__':unittest.main()
