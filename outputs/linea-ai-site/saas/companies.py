"""Gestione aziendale. Le operazioni del gestore sono disponibili solo da CLI locale."""
import json, re, time
from urllib.parse import urlsplit
from . import store

def init(d):
 d.executescript("""
 CREATE TABLE IF NOT EXISTS company_management(company_id TEXT PRIMARY KEY REFERENCES companies(id),verified INTEGER NOT NULL DEFAULT 0,config_version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS company_knowledge(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),kind TEXT NOT NULL,content TEXT NOT NULL,source TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,ai_allowed INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS company_invites(hash TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),email TEXT NOT NULL,expires REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS installations(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),origin TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS installation_tickets(hash TEXT PRIMARY KEY,installation_id TEXT NOT NULL REFERENCES installations(id),expires REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS installation_sessions(access_hash TEXT PRIMARY KEY,installation_id TEXT NOT NULL REFERENCES installations(id));
 CREATE TABLE IF NOT EXISTS company_reviews(company_id TEXT NOT NULL,conversation_id TEXT NOT NULL,comment TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(company_id,conversation_id),FOREIGN KEY(company_id,conversation_id) REFERENCES conversations(company_id,id));
 CREATE TABLE IF NOT EXISTS company_audit(id INTEGER PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),action TEXT NOT NULL,created_at TEXT NOT NULL);
 INSERT OR IGNORE INTO company_management(company_id) SELECT id FROM companies;
 """)

def audit(d,cid,action):
 d.execute('INSERT INTO company_audit(company_id,action,created_at) VALUES (?,?,?)',(cid,action,store.now()))

def snapshot(d,cid,raw):
 cfg=json.loads(raw)
 meta=d.execute('SELECT config_version FROM company_management WHERE company_id=?',(cid,)).fetchone()
 cfg['config_version']=meta[0] if meta else 1
 entries=d.execute('SELECT kind,content FROM company_knowledge WHERE company_id=? AND verified=1 AND ai_allowed=1 ORDER BY id',(cid,)).fetchall()
 cfg['knowledge']='\n'.join([cfg.get('knowledge','')]+[x['content'] for x in entries if x['kind']!='rule'])
 cfg['company_rules']='\n'.join(x['content'] for x in entries if x['kind']=='rule')
 from .knowledge_sync import context
 cfg['knowledge']+='\n'+context(d,cid)
 return cfg

def create(name):
 if not isinstance(name,str) or not 1<=len(name.strip())<=120:raise ValueError('Nome azienda non valido.')
 cid=store.token()
 with store.connection() as d:
  d.execute('INSERT INTO companies VALUES (?,?,?,?)',(cid,store.token(),json.dumps(store.default_config(name.strip())),store.now()))
  d.execute('INSERT INTO company_management(company_id) VALUES (?)',(cid,))
  audit(d,cid,'created_by_operator')
 return cid

def verify(cid):
 from .verification import review
 review(cid,'verified','Verifica locale di azienda e referente')

def is_verified(d,cid):
 row=d.execute('SELECT verified FROM company_management WHERE company_id=?',(cid,)).fetchone()
 return bool(row and row[0])

def invite(cid,email):
 email=email.strip().lower()
 if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>200:raise ValueError('Email non valida.')
 value=store.token()
 with store.connection() as d:
  if not is_verified(d,cid):raise ValueError('Verificare prima l’azienda e la persona autorizzata.')
  if d.execute('SELECT 1 FROM users WHERE email=?',(email,)).fetchone():raise ValueError('Esiste già un account con questa email.')
  d.execute('DELETE FROM company_invites WHERE company_id=? AND email=?',(cid,email))
  d.execute('INSERT INTO company_invites VALUES (?,?,?,?)',(store.digest(value),cid,email,time.time()+86400))
  audit(d,cid,'invitation_created')
 return value

def accept_invite(value,password):
 if not isinstance(password,str) or not 12<=len(password)<=256:raise ValueError('Scegli una password di almeno 12 caratteri.')
 encoded=store.password_hash(password)
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute('SELECT * FROM company_invites WHERE hash=? AND expires>?',(store.digest(value),time.time())).fetchone()
  if not row or not is_verified(d,row['company_id']):raise ValueError('Invito scaduto o non valido.')
  if d.execute('SELECT 1 FROM users WHERE email=?',(row['email'],)).fetchone():raise ValueError('Account già presente. Accedi.')
  d.execute('INSERT INTO users VALUES (?,?,?,?)',(store.token(),row['company_id'],row['email'],encoded))
  d.execute('DELETE FROM company_invites WHERE hash=?',(store.digest(value),))
  audit(d,row['company_id'],'invitation_accepted')
 return store.login(row['email'],password)

def add_knowledge(cid,kind,content,source):
 store.company(cid)
 if kind not in ('public','private','rule') or not 1<=len(content.strip())<=4000 or not 1<=len(source.strip())<=500:raise ValueError('Contenuto o fonte non validi.')
 if kind=='public':
  u=urlsplit(source)
  if u.scheme not in ('https','http') or not u.hostname or u.username or u.password:raise ValueError('Per una fonte pubblica indica il collegamento originale.')
 identifier=store.token()
 with store.connection() as d:
  d.execute('INSERT INTO company_knowledge VALUES (?,?,?,?,?,0,0,?)',(identifier,cid,kind,content.strip(),source.strip(),store.now()))
  audit(d,cid,'knowledge_draft_added')
 return identifier

def review_knowledge(cid,identifier,content,ai_allowed):
 if not 1<=len(content.strip())<=4000:raise ValueError('Contenuto non valido.')
 with store.connection() as d:
  if d.execute('UPDATE company_knowledge SET content=?,verified=1,ai_allowed=?,updated_at=? WHERE company_id=? AND id=?',(content.strip(),int(ai_allowed),store.now(),cid,identifier)).rowcount!=1:raise store.Missing()
  d.execute('UPDATE company_management SET config_version=config_version+1 WHERE company_id=?',(cid,))
  audit(d,cid,'knowledge_reviewed')

def installation(cid,origin):
 u=urlsplit(origin)
 if u.scheme not in ('http','https') or not u.hostname or u.path not in ('','/') or u.query or u.fragment or u.username or u.password:raise ValueError('Indica solo l’origine del sito, ad esempio https://azienda.example.')
 if u.scheme=='http' and u.hostname not in ('127.0.0.1','localhost'):raise ValueError('I siti esterni richiedono HTTPS.')
 origin=u.scheme+'://'+u.netloc
 identifier=store.token()
 with store.connection() as d:
  if not is_verified(d,cid):raise ValueError('L’azienda deve essere verificata.')
  d.execute('INSERT INTO installations VALUES (?,?,?,1,?)',(identifier,cid,origin,store.now()))
  audit(d,cid,'installation_created')
 return identifier

def installation_info(identifier):
 with store.connection() as d:
  row=d.execute('SELECT i.* FROM installations i JOIN company_management m ON m.company_id=i.company_id WHERE i.id=? AND i.enabled=1 AND m.verified=1',(identifier,)).fetchone()
 if not row:raise store.Missing()
 return dict(row)

def issue_ticket(identifier):
 installation_info(identifier);value=store.token()
 with store.connection() as d:
  d.execute('DELETE FROM installation_tickets WHERE expires<?',(time.time(),))
  d.execute('INSERT INTO installation_tickets VALUES (?,?,?)',(store.digest(value),identifier,time.time()+120))
 return value

def start_installation(identifier,value):
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute('SELECT c.*,i.id AS installation FROM installation_tickets t JOIN installations i ON i.id=t.installation_id JOIN companies c ON c.id=i.company_id JOIN company_management m ON m.company_id=c.id WHERE t.hash=? AND t.expires>? AND i.id=? AND i.enabled=1 AND m.verified=1',(store.digest(value),time.time(),identifier)).fetchone()
  if not row:raise store.Missing()
  d.execute('DELETE FROM installation_tickets WHERE hash=?',(store.digest(value),))
  access,cfg=store.insert_chat(d,row)
  d.execute('INSERT INTO installation_sessions VALUES (?,?)',(store.digest(access),identifier))
 return access,cfg

def revoke(identifier):
 with store.connection() as d:
  row=d.execute('SELECT company_id FROM installations WHERE id=?',(identifier,)).fetchone()
  if not row:raise store.Missing()
  d.execute('UPDATE installations SET enabled=0 WHERE id=?',(identifier,))
  d.execute('DELETE FROM installation_tickets WHERE installation_id=?',(identifier,))
  audit(d,row['company_id'],'installation_revoked')

def overview(cid):
 with store.connection() as d:
  meta=d.execute('SELECT verified,config_version FROM company_management WHERE company_id=?',(cid,)).fetchone()
  knowledge=[dict(x) for x in d.execute('SELECT * FROM company_knowledge WHERE company_id=? ORDER BY updated_at DESC',(cid,))]
  installations=[dict(x) for x in d.execute('SELECT id,origin,enabled,created_at FROM installations WHERE company_id=?',(cid,))]
  feedback=[dict(x) for x in d.execute('SELECT conversation_id,rating,comment FROM feedback WHERE company_id=?',(cid,))]
  reviews=[dict(x) for x in d.execute('SELECT conversation_id,comment,updated_at FROM company_reviews WHERE company_id=?',(cid,))]
  total=d.execute('SELECT COUNT(*) FROM conversations WHERE company_id=?',(cid,)).fetchone()[0]
  counts={x[0]:x[1] for x in d.execute('SELECT status,COUNT(*) FROM leads WHERE company_id=? GROUP BY status',(cid,))}
 return dict(verified=bool(meta and meta['verified']),config_version=meta['config_version'] if meta else 1,knowledge=knowledge,installations=installations,feedback=feedback,reviews=reviews,statistics=dict(conversations=total,leads=sum(counts.values()),statuses=counts,lead_percentage=round(sum(counts.values())*100/total,1) if total else None,feedback_average=round(sum(x['rating'] for x in feedback)/len(feedback),2) if feedback else None))

def review(cid,sid,comment):
 if not isinstance(comment,str) or not 1<=len(comment.strip())<=2000:raise ValueError('Scrivi un feedback entro 2000 caratteri.')
 with store.connection() as d:
  if not d.execute('SELECT 1 FROM conversations WHERE company_id=? AND id=?',(cid,sid)).fetchone():raise store.Missing()
  d.execute('INSERT INTO company_reviews VALUES (?,?,?,?) ON CONFLICT(company_id,conversation_id) DO UPDATE SET comment=excluded.comment,updated_at=excluded.updated_at',(cid,sid,comment.strip(),store.now()))
