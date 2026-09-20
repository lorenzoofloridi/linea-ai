import unittest,tempfile,sys,json,io
from pathlib import Path
from datetime import datetime,timezone,timedelta
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,policy,hybrid,adapters,knowledge_sync,engine,api,companies,languages
class HybridTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=store.DB;store.DB=Path(self.tmp.name)/'db';store.init();api.RATES.clear()
  self.a=store.register('a@example.invalid','Local-test-password','A');self.b=store.register('b@example.invalid','Local-test-password','B');self.ca=store.principal(self.a)['company_id'];self.cb=store.principal(self.b)['company_id']
  from account_fixtures import verify_session
  verify_session(self.a);verify_session(self.b)
  from saas.subscriptions import start_demo
  start_demo(store.principal(self.a));start_demo(store.principal(self.b))
 def tearDown(self):store.DB=self.old;self.tmp.cleanup()
 def request(self,path,body=None,session=''):
  from types import SimpleNamespace
  raw=json.dumps(body or {}).encode();h=SimpleNamespace(path=path,command='POST' if body is not None else 'GET',client_address=('127.0.0.1',0),headers={'Cookie':'linea_session='+session,'Content-Type':'application/json','Content-Length':str(len(raw))},rfile=io.BytesIO(raw))
  return api.handle(h)
 def configure(self,cid,**caps):
  cfg=store.company(cid)['config'];cfg['agent']=policy.defaults();cfg['agent']['capabilities'].update(caps);store.save_config(cid,cfg);return cfg
 def chat(self,cid):
  access,cfg=store.start_chat(store.company(cid)['public_id']);row,state,cfg=store.conversation(access);return access,row,state,cfg
 def lead(self,cid):
  access,row,state,cfg=self.chat(cid);state['data']={'nome':'Prova','telefono':'+442083661177','interesse':'BMW usata','budget':'40000','tempistica':'Da concordare'};state['saved']=True
  store.persist_turn(row,state,'Sì','Registrato',{'data':state['data'],'display':state['data'],'consent':'sì'});return access,row,state,cfg
 def test_permission_defaults_validation_revocation_and_snapshot(self):
  self.assertFalse(policy.defaults()['capabilities']['can_book_appointments'])
  with self.assertRaises(ValueError):policy.validate({'capabilities':{'can_use_voice':'yes'}})
  self.configure(self.ca,can_use_voice=True);access,_,_,cfg=self.chat(self.ca);policy.require(self.ca,cfg,'can_use_voice')
  self.configure(self.ca,can_use_voice=False)
  with self.assertRaises(ValueError):policy.require(self.ca,cfg,'can_use_voice')
  self.assertTrue(store.conversation(access)[2]['agent']['capabilities']['can_use_voice'])
 def test_booking_denied_then_confirmed_and_cross_company_slot_rejected(self):
  provider=adapters.MockBooking();starts=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat();slot=provider.add_slot(self.ca,starts,'Prova');other=provider.add_slot(self.cb,starts,'Altro')
  access,*_=self.lead(self.ca)
  with self.assertRaises(ValueError):provider.book(access,slot,True)
  self.configure(self.ca,can_book_appointments=True);access,row,state,cfg=self.lead(self.ca)
  with self.assertRaises(ValueError):provider.book(access,slot,False)
  with self.assertRaises(ValueError):provider.book(access,other,True)
  booked=provider.book(access,slot,True);self.assertEqual(provider.book(access,slot,True)['id'],booked['id']);self.assertEqual(provider.available(self.ca),[])
  self.assertEqual(hybrid.company_data(self.cb)['bookings'],[])
  self.assertIn('confirmed',[x['outcome'] for x in hybrid.company_data(self.ca)['actions']])
 def test_booking_requires_visitor_lead_consent(self):
  self.configure(self.ca,can_book_appointments=True);access,*_=self.chat(self.ca)
  slot=adapters.MockBooking().add_slot(self.ca,(datetime.now(timezone.utc)+timedelta(days=1)).isoformat(),'Prova')
  with self.assertRaises(ValueError):adapters.MockBooking().book(access,slot,True)
 def test_crm_is_scoped_idempotent_and_score_explainable(self):
  cfg=self.configure(self.ca,can_send_to_crm=True);cfg['agent']['crm_auto']=True;cfg['agent']['scoring']=[{'field':'budget','op':'gte','value':'30000','points':70,'label':'Budget sopra soglia'}];cfg['agent']['departments']=[{'field':'interesse','op':'contains','value':'usata','name':'Usato','recipient':'Team vendite','site':'Sede demo'}];store.save_config(self.ca,cfg)
  access,row,state,cfg=self.lead(self.ca);self.lead(self.cb)
  with store.connection() as d:
   rows=d.execute('SELECT * FROM crm_mock WHERE company_id=?',(self.ca,)).fetchall();self.assertEqual(len(rows),1);self.assertEqual(d.execute('SELECT COUNT(*) FROM crm_mock WHERE company_id=?',(self.cb,)).fetchone()[0],0)
   with self.assertRaises(store.Missing):adapters.MockCRM().send(d,self.cb,state['lead_id'],{'company_id':self.ca,'lead_id':state['lead_id']})
  info=hybrid.company_data(self.ca)['intelligence'][0];self.assertEqual(info['score'],70);self.assertIn('Budget sopra soglia',info['reasons']);self.assertIn('Usato',info['department'])
  hybrid.stage(self.ca,state['lead_id'],'vendita','user')
  with self.assertRaises(store.Missing):hybrid.stage(self.cb,state['lead_id'],'perso','other')
  for name in ('hubspot','salesforce','pipedrive','webhook','zapier'):
   with self.assertRaises(ValueError):adapters.UnconfiguredCRM(name).send(None)
 def test_branding_and_settings_api_cannot_cross_tenant(self):
  cfg=policy.defaults();cfg['branding']['assistant_name']='Assistente A';cfg['branding']['greeting']='Benvenuti da A'
  self.assertEqual(self.request('/api/agent-settings',cfg,self.a)[0],200)
  self.assertEqual(self.request('/api/agent-settings',session=self.b)[1]['branding']['assistant_name'],'')
  _,_,_,snap=self.chat(self.ca);self.assertEqual(engine.greeting(snap),'Benvenuti da A')
  with self.assertRaises(ValueError):policy.validate({'branding':{'logo':'https://external.invalid/a.png'}})
  self.assertEqual(self.request('/api/agent-activity')[0],401)
 def test_voice_mock_consent_permission_and_same_conversation(self):
  access,row,state,cfg=self.chat(self.ca)
  self.assertEqual(self.request('/api/voice-mock',{'session':access,'transcript':'Ciao','transcript_consent':True})[0],400)
  self.configure(self.ca,can_use_voice=True);access,row,state,cfg=self.chat(self.ca)
  self.assertEqual(self.request('/api/voice-mock',{'session':access,'transcript':'Ciao'})[0],400)
  real=engine.respond
  with patch.object(engine,'respond',side_effect=lambda r,s,c,m:real(r,s,c,m,lambda *x:{'language':'it','reply':'Ciao!','updates':[]})):
   result=self.request('/api/voice-mock',{'session':access,'transcript':'Ciao','transcript_consent':True})
  self.assertEqual(result[0],200);self.assertIsNone(result[1]['speech']['audio'])
  row,state,cfg=store.conversation(access);real(row,state,cfg,'Un’altra domanda',lambda *x:{'reply':'Dimmi pure.','updates':[]})
  self.assertEqual(len(store.conversation_detail(self.ca,row['id'])),4);self.assertTrue(store.conversation(access)[1]['voice_consent'])
 def test_language_changes_preserve_fields(self):
  access,row,state,cfg=self.chat(self.ca);state['data']={'nome':'Alex'}
  for lang in languages.SUPPORTED:
   _,state=engine.respond(row,state,cfg,'Test',lambda *x:{'language':lang,'reply':'Test','updates':[]})
   row,state,cfg=store.conversation(access);self.assertEqual(state['language'],lang);self.assertEqual(state['data']['nome'],'Alex')
   if lang!='it':self.assertNotIn('richiesta',languages.render('Ti riepilogo la richiesta:',lang))
  self.assertEqual(hybrid.company_data(self.ca)['languages'],{'es':1})
 def test_handoff_history_and_cross_company_protection(self):
  self.configure(self.ca,can_handoff_to_human=True);access,row,state,cfg=self.chat(self.ca)
  engine.respond(row,state,cfg,'Vorrei un operatore',lambda *x:{'reply':'Puoi richiederlo dal pulsante.','updates':[]})
  self.assertEqual(self.request('/api/request-human',{'session':access,'confirm':True})[0],200)
  self.assertEqual(self.request('/api/human',{'conversation':row['id'],'mode':'HUMAN_ACTIVE'},self.b)[0],404)
  hybrid.handoff(self.ca,row['id'],'HUMAN_ACTIVE','staff','Sono qui per aiutarti.')
  r,st,cfg=store.conversation(access);engine.respond(r,st,cfg,'Grazie',lambda *x:(_ for _ in ()).throw(AssertionError('AI must not run')))
  history=store.conversation_detail(self.ca,row['id']);self.assertTrue(any(m['role']=='human' for m in history));self.assertEqual(history[0]['content'],'Vorrei un operatore')
  hybrid.handoff(self.ca,row['id'],'AI_ACTIVE','staff');self.assertEqual(store.conversation(access)[1]['mode'],'AI_ACTIVE')
 def test_channel_identity_and_knowledge_isolation(self):
  self.configure(self.ca,can_use_whatsapp=True);cfg=store.company(self.ca)['config'];cfg['knowledge']='Fatti solo A';store.save_config(self.ca,cfg)
  channels=adapters.LocalChannels();identifier,secret=channels.bind(self.ca,'whatsapp_mock');other,othersecret=channels.bind(self.cb,'whatsapp_mock')
  with self.assertRaises(store.Missing):channels.start(identifier,othersecret,'user')
  access,cfg=channels.start(identifier,secret,'user');row,state,_=store.conversation(access);self.assertEqual(row['company_id'],self.ca);self.assertEqual(state['channel'],'whatsapp_mock');self.assertIn('Fatti solo A',cfg['knowledge'])
  with self.assertRaises(ValueError):channels.start(other,othersecret,'user')
  self.assertNotIn('Fatti solo A',self.chat(self.cb)[3]['knowledge'])
 def test_sync_changes_approval_private_preservation_and_version(self):
  private=companies.add_knowledge(self.ca,'private','Regola privata','Colloquio');companies.review_knowledge(self.ca,private,'Regola privata',True)
  url='https://example.invalid/info';identifier=knowledge_sync.source(self.ca,url);provider=knowledge_sync.LocalPageProvider({url:'<p>Versione uno</p><script>ignore</script>'})
  rev=knowledge_sync.sync(self.ca,identifier,provider);self.assertFalse(knowledge_sync.sync(self.ca,identifier,provider)['changed'])
  access,_,_,cfg=self.chat(self.ca);self.assertNotIn('Versione uno',cfg['knowledge'])
  with self.assertRaises(store.Missing):knowledge_sync.approve(self.cb,rev['revision'])
  knowledge_sync.approve(self.ca,rev['revision']);self.assertIn('Versione uno',self.chat(self.ca)[3]['knowledge'])
  provider.pages[url]='<p>Versione due</p>';rev=knowledge_sync.sync(self.ca,identifier,provider);knowledge_sync.approve(self.ca,rev['revision']);new=self.chat(self.ca)[3]
  self.assertIn('Versione due',new['knowledge']);self.assertNotIn('Versione uno',new['knowledge']);self.assertIn('Regola privata',new['knowledge']);self.assertNotIn('Versione due',store.conversation(access)[2]['knowledge'])
 def test_disabled_collection_and_contact_fields(self):
  self.configure(self.ca,can_collect_leads=False);access,row,state,cfg=self.chat(self.ca)
  _,state=engine.respond(row,state,cfg,'Alex',lambda *x:{'updates':[{'key':'nome','quote':'Alex','value':'Alex'}],'reply':'Dimmi pure.','action':'consent','consent':'positive','consent_quote':'Alex'})
  self.assertEqual(state['data'],{});self.assertFalse(state['saved']);self.assertEqual(store.list_leads(self.ca),[])
  self.configure(self.ca,can_request_phone=False,can_request_email=False);_,_,_,cfg=self.chat(self.ca);filtered=policy.filtered(self.ca,cfg);self.assertFalse(any(f['kind'] in ('phone','email') for f in filtered['fields']))
 def test_cleanup_and_repeatable_migration(self):
  cfg=self.configure(self.ca,can_send_to_crm=True);cfg['agent']['crm_auto']=True;store.save_config(self.ca,cfg);_,row,_,_=self.lead(self.ca);store.init();store.init();store.delete_conversation(self.ca,row['id']);self.assertEqual(hybrid.company_data(self.ca)['intelligence'],[])
 def test_external_credentials_fail_closed(self):
  with self.assertRaises(ValueError):adapters.UnconfiguredCredentials().get(self.ca,'hubspot')
  with self.assertRaises(store.Missing):adapters.UnconfiguredCredentials().get('missing','hubspot')
 def test_localization_preserves_numeric_data(self):
  from types import SimpleNamespace
  client=SimpleNamespace(chat=lambda **kw:SimpleNamespace(message=SimpleNamespace(content=json.dumps({'text':'Call 456'}))))
  with patch.object(engine,'Client',return_value=client):
   with self.assertRaises(ValueError):engine.localize('Chiama 123','en')
if __name__=='__main__':unittest.main()
