import unittest,os,sys,subprocess,tempfile,json
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
class RuntimeConfigurationTests(unittest.TestCase):
 def run_config(self,values,content=''):
  with tempfile.TemporaryDirectory() as t:
   f=Path(t)/'.env';f.write_text(content,encoding='utf-8')
   env={k:v for k,v in os.environ.items() if not k.startswith('LINEA_')};env.update(LINEA_ENV_FILE=str(f),PYTHONPATH=str(BASE),**values)
   return subprocess.run([sys.executable,'-X','utf8','-c',"import runtime_config as c,json;print(json.dumps([c.PORT,c.BASE_URL,c.model_settings()['model'],str(c.DATA)]))"],env=env,capture_output=True,text=True)
 def test_env_precedence_and_relative_paths(self):
  r=self.run_config({'LINEA_PORT':'8877'},'LINEA_PORT=8878\nLINEA_MODEL=test-model\nLINEA_DATA_DIR=var/test-data\n');self.assertEqual(r.returncode,0,r.stderr)
  d=json.loads(r.stdout);self.assertEqual(d[:3],[8877,'http://127.0.0.1:8877','test-model']);self.assertTrue(d[3].endswith('var/test-data'))
 def test_nonlocal_or_public_secret_paths_rejected(self):
  for values in [{'LINEA_HOST':'0.0.0.0'},{'LINEA_SECRETS_DIR':'outputs/linea-ai-site/dist/private'},{'LINEA_OLLAMA_URL':'https://example.com'},{'LINEA_PORT':'70000'}]:
   self.assertNotEqual(self.run_config(values).returncode,0)
