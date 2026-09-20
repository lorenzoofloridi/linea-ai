"""Offline regression tests: temporary databases, no SMTP or real payments."""
import hashlib,hmac,json,os,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,email_service as email,mail,payments as pay

class ServiceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=store.DB
  store.DB=Path(self.tmp.name)/'test.sqlite3';store.init()
  self.a=store.principal(store.register('a@example.invalid','Local-testing-password','A'))
  self.b=store.principal(store.register('b@example.invalid','Local-testing-password','B'))
  self.config=patch.object(mail,'config',return_value=None);self.config.start()
 def tearDown(self):
  self.config.stop();store.DB=self.old;self.tmp.cleanup()
 def verification_token(self):
  with store.connection() as d:
   row=d.execute("SELECT body FROM email_outbox WHERE company_id=? ORDER BY rowid DESC LIMIT 1",(self.a['company_id'],)).fetchone()
  return row['body'].split('#')[1].split('\n')[0]
 def test_verification_hash_expiry_once_and_isolation(self):
  before=time.time();email.request_verification(self.a);token=self.verification_token()
  with store.connection() as d:
   row=d.execute('SELECT * FROM email_verification_tokens').fetchone()
   self.assertEqual(row['hash'],store.digest(token));self.assertNotEqual(row['hash'],token)
   self.assertAlmostEqual(row['expires']-before,86400,delta=2)
  email.verify(token);self.assertTrue(email.verified(self.a));self.assertFalse(email.verified(self.b))
  with self.assertRaises(ValueError):email.verify(token)
 def test_reissue_invalidates_old_and_expired_token_rejected(self):
  email.request_verification(self.a);old=self.verification_token()
  email.request_verification(self.a);new=self.verification_token();self.assertNotEqual(old,new)
  with self.assertRaises(ValueError):email.verify(old)
  with store.connection() as d:d.execute('UPDATE email_verification_tokens SET expires=0')
  with self.assertRaises(ValueError):email.verify(new)
 def test_verification_and_outbox_are_atomic(self):
  with patch.object(email.service,'send',side_effect=RuntimeError('local failure')):
   with self.assertRaises(RuntimeError):email.request_verification(self.a)
  with store.connection() as d:self.assertEqual(d.execute('SELECT COUNT(*) FROM email_verification_tokens').fetchone()[0],0)
 def test_capture_idempotency_preview_and_no_automatic_smtp(self):
  args=(self.a['company_id'],'test','a@example.invalid','Subject','<script>alert(1)</script>')
  email.service.send(*args);email.service.send(*args)
  with self.assertRaises(ValueError):email.service.send(*args[:-1],'different')
  with store.connection() as d:self.assertEqual(d.execute('SELECT COUNT(*) FROM email_outbox').fetchone()[0],1)
  page=email.preview().read_text();self.assertNotIn('<script>',page);self.assertIn('&lt;script&gt;',page)
  with patch.object(mail,'config',return_value={'configured':True}),patch.object(mail.SMTPTransport,'send') as sender:
   self.assertFalse(mail.deliver_one());sender.assert_not_called()
  with store.connection() as d:
   d.execute('DELETE FROM email_outbox');self.assertEqual(d.execute('SELECT COUNT(*) FROM email_details').fetchone()[0],0)
 def test_reset_expiry_single_use_and_session_revocation(self):
  user,token=store.create_reset(self.a['email'])
  with store.connection() as d:d.execute('UPDATE password_resets SET expires=0')
  with self.assertRaises(ValueError):store.reset_password(token,'Another-testing-password')
  user,token=store.create_reset(self.a['email']);store.reset_password(token,'Another-testing-password')
  with self.assertRaises(ValueError):store.reset_password(token,'Another-testing-password')
  with store.connection() as d:self.assertEqual(d.execute('SELECT COUNT(*) FROM auth_sessions WHERE user_id=?',(self.a['id'],)).fetchone()[0],0)
 def test_all_notification_types_capture(self):
  for kind in ('appointment','support','notification','report','registration'):
   self.assertEqual(email.service.notify(self.a['company_id'],kind,self.a['email'],kind,'Test'),'not_configured')
 def test_payment_idempotency_and_terminal_outcomes(self):
  for outcome in ('succeeded','failed','cancelled'):
   identifier=pay.mock_charge(self.a,outcome,1000,outcome)
   self.assertEqual(identifier,pay.mock_charge(self.a,outcome,1000,outcome))
   with self.assertRaises(ValueError):pay.mock_charge(self.a,outcome,999,outcome)
  self.assertEqual(len(pay.listing(self.a)),3);self.assertEqual(pay.listing(self.b),[])
 def test_partial_full_refund_duplicate_and_cross_company(self):
  identifier=pay.mock_charge(self.a,'order',1000,'succeeded')
  with self.assertRaises(store.Missing):pay.refund(self.b,identifier,100,'refund')
  self.assertTrue(pay.refund(self.a,identifier,400,'one'));self.assertFalse(pay.refund(self.a,identifier,400,'one'))
  self.assertEqual(pay.listing(self.a)[0]['status'],'partially_refunded')
  with self.assertRaises(ValueError):pay.refund(self.a,identifier,700,'two')
  pay.refund(self.a,identifier,600,'two');self.assertEqual(pay.listing(self.a)[0]['status'],'refunded')
  with self.assertRaises(ValueError):pay.refund(self.a,identifier,1,'three')
 def test_webhook_signature_freshness_duplicate_and_transition(self):
  with store.connection() as d:row=pay.create(d,self.a['company_id'],'webhook',1000)
  event=dict(event_id='provider-event',payment_id=row['id'],kind='succeeded',amount=1000,currency='EUR')
  stamp=int(time.time());secret='local-test-only-'*4
  def signature(e,at):return hmac.new(secret.encode(),(str(at)+'.'+json.dumps(e,sort_keys=True,separators=(',',':'))).encode(),hashlib.sha256).hexdigest()
  with patch.dict(os.environ,{'LINEA_PAYMENT_WEBHOOK_SECRET':secret}):
   with self.assertRaises(ValueError):pay.webhook(event,'wrong',stamp)
   with self.assertRaises(ValueError):pay.webhook(event,signature(event,stamp-600),stamp-600)
   self.assertTrue(pay.webhook(event,signature(event,stamp),stamp));self.assertFalse(pay.webhook(event,signature(event,stamp),stamp))
   changed=dict(event,kind='failed')
   with self.assertRaises(ValueError):pay.webhook(changed,signature(changed,stamp),stamp)
   changed['event_id']='later-failure'
   with self.assertRaises(ValueError):pay.webhook(changed,signature(changed,stamp),stamp)
  self.assertEqual(pay.listing(self.a)[0]['status'],'succeeded');self.assertEqual(pay.listing(self.b),[])
 def test_recurring_ledger_once(self):
  with store.connection() as d:
   pay.renewal(d,self.a['company_id'],'period-1',29900,True)
   pay.renewal(d,self.a['company_id'],'period-1',29900,True)
   pay.renewal(d,self.a['company_id'],'period-2',29900,False)
  self.assertEqual(len(pay.listing(self.a)),2)
