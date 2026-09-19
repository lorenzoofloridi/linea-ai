import unittest,tempfile
from pathlib import Path
from saas import store,reviews
class ReviewTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.old=store.DB;store.DB=Path(self.tmp.name)/'test.db';store.init()
 def tearDown(self):store.DB=self.old;self.tmp.cleanup()
 def test_moderation_consent_and_public_fields(self):
  data=dict(name='Test',rating=5,comment='Una prova utile per il sito.',consent=True)
  reviews.submit(data);self.assertEqual(reviews.public()['reviews'],[])
  with store.connection() as d:identifier=d.execute('SELECT id FROM site_reviews').fetchone()[0]
  reviews.moderate(identifier,'approved');row=reviews.public()['reviews'][0];self.assertEqual(row['name'],'Test');self.assertNotIn('id',row)
  reviews.moderate(identifier,'rejected');self.assertEqual(reviews.public()['reviews'],[])
 def test_validation(self):
  for bad in [dict(consent=False),dict(rating=True),dict(rating=6),dict(comment='short'),dict(name='')]:
   data=dict(name='Test',rating=5,comment='Una recensione di prova',consent=True);data.update(bad)
   with self.assertRaises(ValueError):reviews.submit(data)
