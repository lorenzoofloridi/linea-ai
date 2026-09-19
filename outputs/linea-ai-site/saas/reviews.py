"""Platform testimonials: explicit publication consent and local moderation."""
from . import store

def init(d):
 d.execute("CREATE TABLE IF NOT EXISTS site_reviews(id TEXT PRIMARY KEY,name TEXT NOT NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),consent INTEGER NOT NULL)")
def submit(data):
 if data.get('consent') is not True:raise ValueError('Serve il consenso alla pubblicazione della recensione.')
 name=data.get('name');comment=data.get('comment');rating=data.get('rating')
 if not isinstance(name,str) or not 1<=len(name.strip())<=80:raise ValueError('Indica un nome pubblico di massimo 80 caratteri.')
 if not isinstance(comment,str) or not 10<=len(comment.strip())<=1200:raise ValueError('Scrivi una recensione tra 10 e 1200 caratteri.')
 if type(rating)!=int or not 1<=rating<=5:raise ValueError('Scegli una valutazione da 1 a 5.')
 with store.connection() as d:d.execute('INSERT INTO site_reviews VALUES (?,?,?,?,?,?,?)',(store.token(),name.strip(),rating,comment.strip(),store.now(),'pending',1))
def public():
 with store.connection() as d:
  rows=[dict(x) for x in d.execute("SELECT name,rating,comment,created_at FROM site_reviews WHERE status='approved' AND consent=1 ORDER BY rating DESC,created_at DESC LIMIT 12")]
 return {'reviews':rows}
def moderate(identifier,status):
 if status not in ('approved','rejected'):raise ValueError('Esito non valido.')
 with store.connection() as d:
  if not d.execute('UPDATE site_reviews SET status=? WHERE id=?',(status,identifier)).rowcount:raise store.Missing()
if __name__=='__main__':
 import argparse,json
 p=argparse.ArgumentParser();p.add_argument('action',choices=['list','approved','rejected']);p.add_argument('id',nargs='?');a=p.parse_args();store.init()
 if a.action=='list':
  with store.connection() as d:print(json.dumps([dict(x) for x in d.execute('SELECT * FROM site_reviews ORDER BY created_at DESC')],ensure_ascii=False,indent=2))
 else:moderate(a.id,a.action);print('Revisione aggiornata.')
