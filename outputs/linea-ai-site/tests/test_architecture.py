import unittest,tempfile,subprocess,sys,os,json
from pathlib import Path
from unittest.mock import patch
from saas import lifecycle,store
ROOT=Path(__file__).resolve().parents[3]
class ArchitectureTests(unittest.TestCase):
 def test_lifecycle_idempotent(self):
  with tempfile.TemporaryDirectory() as t,patch.object(store,'DB',Path(t)/'test.sqlite3'),patch.object(lifecycle,'WORKERS',False):
   try:
    lifecycle.start();first=lifecycle._stop;lifecycle.start();self.assertIs(first,lifecycle._stop)
   finally:lifecycle.stop()
   self.assertFalse(lifecycle._started)
 def test_import_does_not_start_database_or_workers(self):
  with tempfile.TemporaryDirectory() as t:
   target=Path(t)/'not-created.db';env={k:v for k,v in os.environ.items() if not k.startswith('LINEA_')};env.update(LINEA_DATABASE=str(target),LINEA_ENV_FILE=str(Path(t)/'absent'),PYTHONPATH=str(ROOT/'outputs/linea-ai-site'))
   r=subprocess.run([sys.executable,'-c','import server_api; from saas import lifecycle; assert not lifecycle._started'],env=env,capture_output=True)
   self.assertEqual(r.returncode,0,r.stderr);self.assertFalse(target.exists())
 def test_profiles_and_production_block(self):
  for profile in ['development','test','production']:
   with tempfile.TemporaryDirectory() as t:
    env={k:v for k,v in os.environ.items() if not k.startswith('LINEA_')};env.update(LINEA_ENV=profile,LINEA_ENV_FILE=str(Path(t)/'absent'),PYTHONPATH=str(ROOT/'outputs/mio-agente-ai'))
    code="import runtime_config as c,json; print(json.dumps([c.ENV,c.WORKERS,str(c.DATA)])); c.require_local_runtime()"
    r=subprocess.run([sys.executable,'-c',code],env=env,capture_output=True,text=True)
    self.assertEqual(r.returncode==0,profile!='production');data=json.loads(r.stdout)
    if profile=='test':self.assertFalse(data[1]);self.assertIn('test',data[2])
