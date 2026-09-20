import unittest,importlib.util,tempfile,json,hashlib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def load(name):
 spec=importlib.util.spec_from_file_location('test_'+name,ROOT/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
class PortabilityTests(unittest.TestCase):
 def test_interpreters_and_unicode_paths(self):
  app=load('linea');path=Path('cartella con spazi à')/'.venv'
  self.assertEqual(app.interpreter(path,'nt'),path/'Scripts/python.exe')
  self.assertEqual(app.interpreter(path,'posix'),path/'bin/python')
  self.assertEqual(app.environment_vars()['PYTHONUTF8'],'1')
 def test_snapshot_detects_changes(self):
  check=load('verifica-snapshot')
  with tempfile.TemporaryDirectory() as t:
   p=Path(t);content=b'example'
   with zipfile.ZipFile(p/'snapshot.zip','w') as z:z.writestr('test.txt',content)
   manifest={'archive_sha256':hashlib.sha256((p/'snapshot.zip').read_bytes()).hexdigest(),'files':{'test.txt':hashlib.sha256(content).hexdigest()}}
   (p/'manifest.json').write_text(json.dumps(manifest));check.verify(p)
   (p/'snapshot.zip').write_bytes(b'corrupted')
   with self.assertRaises(ValueError):check.verify(p)
 def test_timezone_available_without_os_database(self):
  import zoneinfo
  original=zoneinfo.TZPATH
  try:
   zoneinfo.reset_tzpath([]);zoneinfo.ZoneInfo.clear_cache();self.assertEqual(zoneinfo.ZoneInfo('Europe/Rome').key,'Europe/Rome')
  finally:zoneinfo.reset_tzpath(original);zoneinfo.ZoneInfo.clear_cache()
