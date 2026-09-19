"""Sync controllata: provider fixture locale, revisione esplicita e versioni immutabili."""
import json
from urllib.parse import urlsplit
from html.parser import HTMLParser
from . import store,hybrid
class TextExtractor(HTMLParser):
 def __init__(self):super().__init__();self.ignore=0;self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style','nav'):self.ignore+=1
 def handle_endtag(self,tag):
  if tag in ('script','style','nav'):self.ignore=max(0,self.ignore-1)
 def handle_data(self,data):
  if not self.ignore and data.strip():self.parts.append(data.strip())
class LocalPageProvider:
 def __init__(self,pages):self.pages=pages
 def fetch(self,url):
  if url not in self.pages:raise ValueError('Pagina non disponibile nel provider locale autorizzato.')
  return self.pages[url]
def source(cid,url):
 store.company(cid);u=urlsplit(url)
 if u.scheme!='https' or not u.hostname or u.username or u.password or u.fragment:raise ValueError('Indica una pagina HTTPS autorizzata.')
 identifier=store.token()
 with store.connection() as d:
  old=d.execute('SELECT id FROM public_sources WHERE company_id=? AND url=?',(cid,url)).fetchone()
  if old:return old[0]
  d.execute('INSERT INTO public_sources VALUES (?,?,?)',(identifier,cid,url))
 return identifier
def sync(cid,identifier,provider):
 with store.connection() as d:s=d.execute('SELECT * FROM public_sources WHERE company_id=? AND id=?',(cid,identifier)).fetchone()
 if not s:raise store.Missing()
 html=provider.fetch(s['url'])
 if not isinstance(html,str) or len(html)>200000:raise ValueError('Pagina troppo grande.')
 parser=TextExtractor();parser.feed(html);content='\n'.join(parser.parts)[:10000]
 if not content:raise ValueError('Nessun testo trovato.')
 digest=store.digest(content);revision=store.token()
 with store.connection() as d:
  old=d.execute('SELECT id FROM public_revisions WHERE source_id=? AND hash=?',(identifier,digest)).fetchone()
  if old:return {'revision':old[0],'changed':False}
  d.execute('INSERT INTO public_revisions VALUES (?,?,?,?,?,?,?,NULL)',(revision,cid,identifier,content,digest,'pending',store.now()));hybrid.audit(d,cid,None,'operator','knowledge_sync','pending')
 return {'revision':revision,'changed':True}
def approve(cid,revision):
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute('SELECT * FROM public_revisions WHERE company_id=? AND id=? AND status=\'pending\'',(cid,revision)).fetchone()
  if not row:raise store.Missing()
  d.execute("UPDATE public_revisions SET status='superseded' WHERE company_id=? AND source_id=? AND status='approved'",(cid,row['source_id']))
  d.execute("UPDATE public_revisions SET status='approved',approved_at=? WHERE company_id=? AND id=?",(store.now(),cid,revision))
  d.execute('UPDATE company_management SET config_version=config_version+1 WHERE company_id=?',(cid,));hybrid.audit(d,cid,None,'operator','knowledge_revision','approved')
def context(d,cid):
 return '\n'.join(r[0] for r in d.execute("SELECT content FROM public_revisions WHERE company_id=? AND status='approved'",(cid,)))
