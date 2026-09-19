import unittest,tempfile,sys,time,json,io,threading
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,subscriptions as s,api
class PlanTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=store.DB;store.DB=Path(self.tmp.name)/'test.sqlite3';store.init();api.RATES.clear()
  self.a=store.register('a@example.invalid','Plan-tests-password','A');self.b=store.register('b@example.invalid','Plan-tests-password','B');self.ua=store.principal(self.a);self.ub=store.principal(self.b);self.ca=self.ua['company_id'];self.cb=self.ub['company_id']
 def tearDown(self):store.DB=self.old;self.tmp.cleanup()
 def req(self,path,body=None,session=''):
  raw=json.dumps(body or {}).encode();h=SimpleNamespace(path=path,command='GET' if body is None else 'POST',client_address=('127.0.0.1',1),headers={'Cookie':'linea_session='+session,'Content-Type':'application/json','Content-Length':str(len(raw))},rfile=io.BytesIO(raw));return api.handle(h)
 def ready(self,cid=None):
  cid=cid or self.ca;data={k:'Test' for k in s.PROFILE_FIELDS};data.update(website='https://example.invalid',business_email='info@example.invalid',business_phone='3331234567',country='IT');s.profile(cid,data,'test');s.LocalVerification().review(cid,'verified');return data
 def test_anonymous_identity_and_prices_private(self):
  public=self.req('/api/plans');self.assertEqual(public[0],200);self.assertFalse(public[1]['authenticated']);self.assertEqual(len(public[1]['plans']),4);self.assertNotIn('cents',json.dumps(public[1]));self.assertEqual(self.req('/api/plan-state')[0],401)
  self.assertEqual(len(self.req('/api/plans',session=self.a)[1]['plans']),4)
 def test_demo_seven_days_once_email_and_catalogue_hidden(self):
  now=time.time();r=s.start_demo(self.ua,now);self.assertEqual(r['ends']-r['started'],7*86400);self.assertEqual(s.start_demo(self.ua,now+1)['ends'],r['ends'])
  self.assertTrue(s.access(self.ua,now+1));self.assertFalse(s.access(self.ua,now+7*86400))
  with self.assertRaises(ValueError):s.start_demo(self.ua,now+7*86400)
  with patch.object(s.time,'time',return_value=now+7*86400):self.assertNotIn('demo',[p['code'] for p in s.catalogue(self.ua)['plans']])
  with self.assertRaises(ValueError):s.start_demo(dict(self.ub,email='A@EXAMPLE.INVALID'),now+1)
 def test_access_server_side_not_browser(self):
  self.assertEqual(self.req('/api/leads',session=self.a)[0],402)
  s.start_demo(self.ua);self.assertEqual(self.req('/api/leads',session=self.a)[0],200)
  with store.connection() as d:d.execute('UPDATE plan_demo_usage SET ends=0')
  self.assertEqual(self.req('/api/config',store.company(self.ca)['config'],self.a)[0],402)
  self.assertEqual(self.req('/api/agent-settings',session=self.a)[0],402)
  self.assertEqual(self.req('/api/me',session=self.a)[0],200)
 def test_exact_annual_price(self):
  self.assertEqual(s.amount('base','monthly'),29900);self.assertEqual(s.amount('base','annual'),304980);self.assertEqual(s.amount('base','annual')//12,25415)
 def test_verification_and_confirmation_required(self):
  with self.assertRaises(ValueError):s.start_base(self.ua,'monthly','card',True)
  self.ready()
  with self.assertRaises(ValueError):s.start_base(self.ua,'monthly','card',False)
  s.start_base(self.ua,'monthly','card',True)
  with self.assertRaises(ValueError):s.start_base(self.ua,'monthly','card',True)
 def test_profile_changes_need_new_review_and_company_isolation(self):
  data=self.ready();self.assertEqual(s.state(self.ua)['profile']['status'],'verified');self.assertIsNone(s.state(self.ub)['profile']);data['city']='Other';s.profile(self.ca,data,'test');self.assertEqual(s.state(self.ua)['profile']['status'],'pending')
  self.assertEqual(self.req('/api/plan-profile',dict(data,company_id=self.ca),self.b)[0],400)
 def test_manual_transfer_cannot_auto_debit_or_start_trial(self):
  self.ready()
  with self.assertRaises(ValueError):s.start_base(self.ua,'monthly','bank_transfer',True)
  self.assertIsNone(s.state(self.ua)['subscription'])
  self.assertEqual(self.req('/api/plan-base',{'period':'monthly','method':'card','confirm':True,'card_number':'test'},self.a)[0],400)
 def test_14_day_conversion_exact_and_idempotent(self):
  self.ready();now=time.time();s.start_base(self.ua,'monthly','card',True,now)
  sub=s.state(self.ua)['subscription'];self.assertEqual(sub['trial_end']-sub['trial_start'],14*86400)
  s.process_due(self.ca,now+14*86400-1);self.assertEqual(s.state(self.ua)['subscription']['status'],'trial')
  s.process_due(self.ca,now+14*86400);s.process_due(self.ca,now+14*86400)
  self.assertEqual(s.state(self.ua)['subscription']['status'],'active');events=[e for e in s.state(self.ua)['events'] if e['action']=='payment'];self.assertEqual(len(events),1);self.assertEqual(events[0]['amount_cents'],29900)
 def test_cancellation_prevents_conversion_and_expired_access(self):
  self.ready();now=time.time();s.start_base(self.ua,'annual','sepa',True,now);s.cancel(self.ua,now+1);self.assertTrue(s.access(self.ua,now+2));s.process_due(self.ca,now+14*86400)
  self.assertFalse(s.access(self.ua,now+14*86400));self.assertEqual(s.state(self.ua)['subscription']['status'],'cancelled');self.assertFalse(any(e['action']=='payment' for e in s.state(self.ua)['events']))
 def test_failure_and_cross_company_cancellation(self):
  self.ready();now=time.time();s.start_base(self.ua,'monthly','paypal',True,now)
  class Failed:
   def charge(self,*args):return False
  s.process_due(self.ca,now+14*86400,Failed());self.assertEqual(s.state(self.ua)['subscription']['status'],'past_due');self.assertFalse(s.access(self.ua,now+14*86400));self.assertIsNone(s.state(self.ub)['subscription'])
  self.assertEqual(self.req('/api/plan-cancel',{'company_id':self.ca},self.b)[0],404)
 def test_profile_validation_no_network_and_no_auto_approval(self):
  data={k:'Test' for k in s.PROFILE_FIELDS}
  with self.assertRaises(ValueError):s.profile(self.ca,data,'test')
  data.update(website='https://example.invalid',business_email='info@example.invalid',business_phone='3331234567',country='IT');s.profile(self.ca,data,'test');self.assertEqual(s.state(self.ua)['profile']['status'],'pending')
 def test_repeatable_schema_and_no_duplicate_simultaneous_demo(self):
  errors=[]
  def activate():
   try:s.start_demo(self.ua)
   except Exception as e:errors.append(e)
  threads=[threading.Thread(target=activate) for _ in range(3)]
  for t in threads:t.start()
  for t in threads:t.join()
  self.assertEqual(errors,[]);store.init()
  with store.connection() as d:self.assertEqual(d.execute('SELECT count(*) FROM plan_demo_usage').fetchone()[0],1)

 def test_plus_advanced_prices_and_activation(self):
  self.ready();self.ready(self.cb)
  for user,session,plan,cents,annual in [(self.ua,self.a,'plus',59900,610980),(self.ub,self.b,'advanced',99900,1018980)]:
   self.assertEqual(s.amount(plan,'monthly'),cents);self.assertEqual(s.amount(plan,'annual'),annual)
   result=self.req('/api/plan-base',{'plan':plan,'period':'annual','method':'card','confirm':True},session)
   self.assertEqual(result[0],200);sub=s.state(user)['subscription'];self.assertEqual(sub['plan'],plan);self.assertEqual(sub['amount_cents'],annual);self.assertEqual(sub['trial_end']-sub['trial_start'],14*s.DAY)
 def test_invalid_paid_plan_rejected(self):
  self.ready()
  for plan in ['demo','other']:
   self.assertEqual(self.req('/api/plan-base',{'plan':plan,'period':'monthly','method':'card','confirm':True},self.a)[0],400)

 def test_wallet_method_is_company_scoped(self):
  self.ready();s.start_base(self.ua,'monthly','card',True)
  self.assertEqual(self.req('/api/plan-method',{'method':'sepa'},self.b)[0],404)
  self.assertEqual(s.state(self.ua)['subscription']['method_kind'],'card')
  self.assertEqual(self.req('/api/plan-method',{'method':'sepa','company_id':self.cb},self.a)[0],400)
  self.assertEqual(self.req('/api/plan-method',{'method':'sepa'},self.a)[0],200)
  self.assertEqual(s.state(self.ua)['subscription']['method_kind'],'sepa')
