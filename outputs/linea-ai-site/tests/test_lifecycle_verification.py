import unittest,tempfile,time,sys,json,io
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,subscriptions as plans,verification as company,email_service,api,policy,payments
from saas.plan_entitlements import PLAN_ENTITLEMENTS
from account_fixtures import verify_session
class LifecycleTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=store.DB;store.DB=Path(self.tmp.name)/'test.db';store.init();api.RATES.clear()
  self.a=store.register('a@example.invalid','Lifecycle-password-123','A');self.b=store.register('b@example.invalid','Lifecycle-password-123','B')
  self.ua=store.principal(self.a);self.ub=store.principal(self.b);self.cid=self.ua['company_id'];self.at=time.time()
 def tearDown(self):store.DB=self.old;self.tmp.cleanup()
 def request(self,path,data=None,session=None):
  raw=json.dumps(data or {}).encode();h=SimpleNamespace(path=path,command='POST' if data is not None else 'GET',headers={'Cookie':'linea_session='+(session or self.a),'Content-Type':'application/json','Content-Length':str(len(raw))},client_address=('127.0.0.1',1),rfile=io.BytesIO(raw));return api.handle(h)
 def ready(self):
  verify_session(self.a)
  values={k:'Test' for k in plans.PROFILE_FIELDS};values.update(website='https://example.invalid',business_email='a@example.invalid',business_phone='3331234567',country='IT')
  plans.profile(self.cid,values,self.ua['id']);company.review(self.cid,'verified','Controllo documentale locale di prova')
  plans.start_base(self.ua,'monthly','card',True,self.at)
 def row(self):
  with store.connection() as d:return dict(d.execute('SELECT * FROM plan_subscriptions WHERE company_id=?',(self.cid,)).fetchone())
 def test_unverified_account_limited_and_verification_unlocks(self):
  self.assertEqual(self.request('/api/me')[0],200);self.assertEqual(self.request('/api/plan-demo',{})[0],403)
  self.assertEqual(self.request('/api/leads')[0],403);verify_session(self.a)
  self.assertEqual(self.request('/api/plan-demo',{})[0],200);self.assertEqual(self.request('/api/leads')[0],200)
  self.assertEqual(self.request('/api/plan-demo',{},self.b)[0],403)
 def test_grace_then_expiry_and_reactivation_no_trial(self):
  self.ready();due=self.at+14*plans.DAY
  class Failure:
   def charge(self,*args):return False
  plans.process_due(self.cid,due,Failure());self.assertEqual(self.row()['status'],'past_due');self.assertTrue(plans.access(self.ua,due+1))
  plans.process_due(self.cid,due+7*plans.DAY);self.assertEqual(self.row()['status'],'expired');self.assertFalse(plans.access(self.ua,due+7*plans.DAY))
  plans.reactivate(self.ua,'recovery',True,due+8*plans.DAY);self.assertEqual(self.row()['status'],'active');self.assertEqual(self.row()['trial_end'],due)
  plans.reactivate(self.ua,'recovery',True,due+8*plans.DAY);self.assertEqual(len(payments.listing(self.ua)),2)
 def test_upgrade_and_downgrade_at_renewal(self):
  self.ready();due=self.at+14*plans.DAY
  plans.change_plan(self.ua,'advanced','annual',True);self.assertEqual(self.row()['plan'],'base')
  plans.process_due(self.cid,due);self.assertEqual(self.row()['plan'],'advanced');self.assertEqual(self.row()['amount_cents'],1018980)
  next_due=self.row()['period_end'];plans.change_plan(self.ua,'base','monthly',True);plans.process_due(self.cid,next_due)
  self.assertEqual(self.row()['plan'],'base');self.assertEqual(self.row()['amount_cents'],29900);self.assertEqual(len(payments.listing(self.ua)),2)
 def test_restore_cancel_before_end_without_payment(self):
  self.ready();plans.cancel(self.ua,self.at+1);plans.reactivate(self.ua,'restore',True,self.at+2)
  self.assertFalse(self.row()['cancel_at_end']);self.assertEqual(payments.listing(self.ua),[])
 def test_cancelled_reactivation_requires_payment_and_no_new_trial(self):
  self.ready();plans.cancel(self.ua,self.at+1);plans.process_due(self.cid,self.at+14*plans.DAY)
  self.assertEqual(self.row()['status'],'cancelled');plans.reactivate(self.ua,'new-period',True,self.at+15*plans.DAY)
  self.assertEqual(self.row()['status'],'active');self.assertEqual(len(payments.listing(self.ua)),1)
 def test_failed_reactivation_does_not_restore_access(self):
  self.ready();plans.cancel(self.ua);plans.process_due(self.cid,self.at+14*plans.DAY)
  class Failure:
   def charge(self,*args):return False
  plans.reactivate(self.ua,'fail',True,self.at+15*plans.DAY,Failure());self.assertEqual(self.row()['status'],'cancelled')
  plans.reactivate(self.ua,'fail',True,self.at+15*plans.DAY);self.assertEqual(len(payments.listing(self.ua)),1)
 def test_entitlement_enforced_in_backend(self):
  self.ready();cfg=store.company(self.cid)['config'];cfg['agent']={'capabilities':{'can_book_appointments':True}};store.save_config(self.cid,cfg)
  with patch.dict(PLAN_ENTITLEMENTS['base'],{'booking':False,'export':False}):
   with self.assertRaises(ValueError):policy.require(self.cid,cfg,'can_book_appointments')
   self.assertEqual(self.request('/api/data-export.xlsx')[0],402)
 def test_suspension_blocks_live_chat_access_and_renewal(self):
  self.ready();access,cfg=store.start_chat(store.company(self.cid)['public_id']);company.review(self.cid,'suspended','Controllo amministrativo')
  with self.assertRaises(store.Missing):store.conversation(access)
  self.assertFalse(plans.access(self.ua));plans.process_due(self.cid,self.at+15*plans.DAY);self.assertEqual(payments.listing(self.ua),[])
  with self.assertRaises(ValueError):plans.reactivate(self.ua,'blocked',True)
 def test_company_history_actor_and_cross_company(self):
  self.ready();company.review(self.cid,'suspended','Motivo di prova')
  history=company.history(self.cid);self.assertEqual(history[-1]['previous'],'verified');self.assertEqual(history[-1]['status'],'suspended');self.assertTrue(history[-1]['actor'].startswith('local:'));self.assertTrue(history[-1]['created_at'])
  self.assertEqual(self.request('/api/company-verification',session=self.b)[1]['history'],[])
  self.assertEqual(self.request('/api/company-verification',{'status':'verified','company_id':self.cid},self.b)[0],404)
 def test_company_transition_validation_and_review_recovery(self):
  company.review(self.cid,'rejected','Documenti insufficienti')
  with self.assertRaises(ValueError):company.review(self.cid,'verified','Tentativo senza nuova revisione')
  company.review(self.cid,'under_review','Nuovi documenti');company.review(self.cid,'verified','Controllo completato')
  self.assertEqual(company.status(self.cid),'verified')
 def test_cross_company_plan_change_and_reactivate(self):
  self.ready();verify_session(self.b)
  self.assertEqual(self.request('/api/plan-change',{'plan':'plus','period':'monthly','confirm':True,'company_id':self.cid},self.b)[0],400)
  self.assertEqual(self.request('/api/plan-reactivate',{'key':'x','confirm':True},self.b)[0],404)
  self.assertEqual(self.row()['plan'],'base')
 def test_migration_preserves_old_subscription_and_repeats(self):
  self.ready();before=self.row()
  # Reconstruct historical schema, retaining the actual subscription data.
  with store.connection() as d:
   sql=d.execute("SELECT sql FROM sqlite_master WHERE name='plan_subscriptions'").fetchone()[0]
   sql=sql.replace('"plan_subscriptions"','old_sub').replace('plan_subscriptions(','old_sub(').replace(",'expired'",'')
   d.execute(sql);d.execute('INSERT INTO old_sub SELECT * FROM plan_subscriptions');d.execute('DROP TABLE plan_subscriptions');d.execute('ALTER TABLE old_sub RENAME TO plan_subscriptions')
  store.init();store.init();self.assertEqual(before,self.row())
  with store.connection() as d:self.assertEqual(d.execute('PRAGMA foreign_key_check').fetchall(),[])
