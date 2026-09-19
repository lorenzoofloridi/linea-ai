import json, unittest
from pathlib import Path

class SitePreferencesTests(unittest.TestCase):
 def test_translation_catalogue(self):
  root=Path(__file__).resolve().parents[1]/'dist'
  catalog=json.loads((root/'translations.json').read_text())
  for source,translations in catalog.items():
   self.assertEqual(set(translations),{'en','es','fr'})
   self.assertTrue(all(isinstance(v,str) and v.strip() for v in translations.values()),source)
  for text in ['Accetta','Rifiuta','Solo obbligatori','Offerte','Richiedi una prova','Prova la Demo']:
   self.assertIn(text,catalog)
 def test_home_loads_preferences_and_cookie_information(self):
  root=Path(__file__).resolve().parents[1]/'dist'
  home=(root/'index.html').read_text()
  self.assertIn('site-preferences.js',home)
  self.assertIn('site-preferences.css',home)
  info=(root/'cookie.html').read_text()
  self.assertIn('180 giorni',info)
  self.assertIn('linea.language',info)
