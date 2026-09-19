import unittest,tempfile,json,io,time,re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from saas import store,api,mail
class AccountTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=store.DB;store.DB=Path(self.tmp.name)/'test.sqlite3';store.init();api.RATES.clear()
 def tearDown(self):store.DB=self.old;self.tmp.cleanup()
 def req(self,path,data,cookie=''):
  raw=json.dumps(data).encode();h=SimpleNamespace(path=path,command='POST',client_address=('127.0.0.1',1),headers={'Cookie':'linea_session='+cookie,'Content-Type':'application/json','Content-Length':str(len(raw))},rfile=io.BytesIO(raw));return api.handle(h),getattr(h,'extra_headers',[])
 def registration(self,**kw):return dict(email='account@example.invalid',password='Account-test-password-123',password_confirm='Account-test-password-123',company='Test',terms=True,privacy=True,**kw)
 def test_registration_requires_explicit_choices_and_matching_password(self):
  for key,value in [('terms',False),('privacy',False),('password_confirm','mismatch')]:
   b=self.registration();b[key]=value;self.assertEqual(self.req('/api/register',b)[0][0],400)
  with store.connection() as d:self.assertEqual(d.execute('SELECT count(*) FROM users').fetchone()[0],0)
 def test_choices_atomic_default_optional_and_not_retroactive(self):
  self.assertEqual(self.req('/api/register',self.registration())[0][0],200)
  with store.connection() as d:
   r=d.execute('SELECT * FROM registration_consents').fetchone();self.assertEqual(r['marketing_analysis'],0);self.assertEqual(r['terms_version'],'local-2026-09-19')
  store.register('old@example.invalid','Legacy-password-123','Old')
  store.init()
  with store.connection() as d:self.assertEqual(d.execute('SELECT count(*) FROM registration_consents').fetchone()[0],1)
 def test_remember_cookie_and_server_expiry_and_logout(self):
  store.register('account@example.invalid','Account-test-password-123','Test')
  for remember,duration in [(False,8*3600),(True,30*86400)]:
   result,headers=self.req('/api/login',dict(email='account@example.invalid',password='Account-test-password-123',remember=remember))
   self.assertEqual(result[0],200);cookie=headers[0][1];self.assertIn('HttpOnly; SameSite=Strict',cookie);self.assertEqual('Max-Age=2592000' in cookie,remember)
   token=cookie.split(';')[0].split('=',1)[1]
   with store.connection() as d:remaining=d.execute('SELECT expires FROM auth_sessions WHERE hash=?',(store.digest(token),)).fetchone()[0]-time.time()
   self.assertAlmostEqual(remaining,duration,delta=3)
   self.req('/api/logout',{},token)
   with self.assertRaises(store.Unauthorized):store.principal(token)
 def test_local_reset_generic_response_and_no_token_in_api(self):
  session=store.register('account@example.invalid','Account-test-password-123','Test')
  with patch.object(mail,'config',return_value=None):
   known=self.req('/api/password-request',{'email':'account@example.invalid'})[0]
   unknown=self.req('/api/password-request',{'email':'unknown@example.invalid'})[0]
  self.assertEqual(known,unknown)
  files=list((store.DB.parent/'local-mail').glob('*.txt'));self.assertEqual(len(files),1);self.assertEqual(files[0].stat().st_mode&0o777,0o600)
  token=files[0].read_text().split('#')[-1].strip();self.assertNotIn(token,str(known))
  self.assertEqual(self.req('/api/password-reset',{'token':token,'password':'Changed-test-password-123'})[0][0],200)
  with self.assertRaises(store.Unauthorized):store.principal(session)
  self.assertEqual(self.req('/api/password-reset',{'token':token,'password':'Another-test-password-123'})[0][0],400)
 def test_real_email_path_is_queued_not_falsely_marked_sent(self):
  store.register('account@example.invalid','Account-test-password-123','Test')
  with patch.object(mail,'config',return_value={'configured':True}),patch.object(mail,'enqueue') as enqueue:
   self.assertEqual(self.req('/api/password-request',{'email':'account@example.invalid'})[0][0],200);enqueue.assert_called_once()
  self.assertFalse((store.DB.parent/'local-mail').exists())
