import sqlite3,json,secrets,hashlib,hmac,time,re
from pathlib import Path
from contextlib import contextmanager
ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/'private-data/platform.sqlite3'
STATUSES=('Nuova','Da contattare','In lavorazione','Completata')
def now():
 from datetime import datetime,timezone
 return datetime.now(timezone.utc).isoformat()
def token():return secrets.token_urlsafe(32)
def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def field(key,label,required=True,kind='text'):return dict(key=key,label=label,required=required,kind=kind)
def default_config(name='Azienda Demo',sector='Generale'):
 return dict(name=name,sector=sector,recipient='personale dell’azienda',knowledge='',region='IT',confirmation_email=False,fields=[field('nome','Nome e cognome'),field('telefono','Telefono',True,'phone'),field('email','Email',False,'email'),field('interesse','Prodotto, servizio o esigenza'),field('tempistica','Preferenza per essere contattati')])
def services_config():
 from . import policy
 cfg=default_config('Servizi Linea AI')
 cfg.update(recipient='supporto Linea AI',service_demo=True,fields=[field('nome','Nome'),field('email','Email di riferimento',True,'email'),field('interesse','Richiesta per il supporto')],knowledge="Linea AI offre una piattaforma multi-settore: assistente personalizzato per azienda, informazioni aziendali verificate, raccolta e qualificazione dei contatti con consenso, dashboard privata con conversazioni e richieste, campi personalizzati e separazione dei dati aziendali. Sono predisposti in simulazione locale prenotazioni autorizzate, CRM, voce e canali aggiuntivi: non presentarli come servizi reali già attivi. La disponibilità continua richiederà futura infrastruttura online. Per tariffe e confronto dei piani indirizza alla sezione Offerte del sito, /#offerte: i prezzi sono visibili dopo registrazione e accesso. Demo di 7 giorni; Base, Plus e Advanced con prova di 14 giorni e opzione annuale con risparmio del 15%. Servizi inclusi nei singoli piani ancora da definire. Pagamenti simulati. Il supporto può gestire una richiesta via email; in questa anteprima l'invio email non è configurato, non garantire invii o tempi. Nessun contatto telefonico richiesto.")
 cfg['agent']=policy.defaults() if hasattr(policy,'defaults') else policy.validate({})
 cfg['agent']['capabilities']['can_request_phone']=False
 cfg['agent']['branding']['greeting']='Ciao! Sono l’assistente di Servizi Linea AI. Posso aiutarti a conoscere il servizio e scegliere come iniziare. Cosa vorresti sapere?'
 return cfg

def validate_config(data):
 if not isinstance(data,dict):raise ValueError('Configurazione non valida.')
 out={}
 for k,maxlen in [('name',120),('sector',100),('recipient',120),('knowledge',10000),('region',2)]:
  v=data.get(k,'')
  if not isinstance(v,str) or len(v)>maxlen or (k!='knowledge' and not v.strip()):raise ValueError('Controlla la configurazione.')
  out[k]=v.strip()
 if not re.fullmatch('[A-Z]{2}',out['region']):raise ValueError('Indica un paese con codice di due lettere, ad esempio IT.')
 out['confirmation_email']=data.get('confirmation_email') is True
 fs=data.get('fields')
 if not isinstance(fs,list) or not 3<=len(fs)<=18:raise ValueError('Configura da 3 a 18 campi.')
 out['fields']=[];seen=set()
 for f in fs:
  if not isinstance(f,dict):raise ValueError('Campo non valido.')
  k=f.get('key','');label=f.get('label','');kind=f.get('kind','text')
  if not isinstance(k,str) or not re.fullmatch('[a-z][a-z0-9_]{0,39}',k) or k in seen:raise ValueError('I campi devono avere identificativi distinti.')
  if not isinstance(label,str) or not 1<=len(label.strip())<=100 or kind not in ('text','phone','email'):raise ValueError('Campo non valido.')
  seen.add(k);out['fields'].append(field(k,label.strip(),f.get('required') is True,kind))
 for k,kind in [('nome','text'),('telefono','phone'),('interesse','text')]:
  f=next((x for x in out['fields'] if x['key']==k),None)
  if not f or not f['required'] or f['kind']!=kind:raise ValueError('Nome, telefono e interesse devono rimanere obbligatori.')
 from . import policy
 out['agent']=policy.validate(data.get('agent',{}))
 return out
@contextmanager
def connection():
 DB.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 db=sqlite3.connect(DB,timeout=10);db.row_factory=sqlite3.Row
 db.execute('PRAGMA foreign_keys=ON')
 try:
  yield db;db.commit()
 except Exception:db.rollback();raise
 finally:db.close()

def init():
 with connection() as d:
  d.executescript('''
  CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,public_id TEXT UNIQUE NOT NULL,config TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),email TEXT UNIQUE NOT NULL,password TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS password_resets(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires REAL NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires REAL NOT NULL);
  CREATE TABLE IF NOT EXISTS conversations(id TEXT NOT NULL,company_id TEXT NOT NULL REFERENCES companies(id),access_hash TEXT UNIQUE NOT NULL,state TEXT NOT NULL,config TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,expires REAL NOT NULL,PRIMARY KEY(company_id,id));
  CREATE TABLE IF NOT EXISTS messages(company_id TEXT NOT NULL,conversation_id TEXT NOT NULL,seq INTEGER NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(company_id,conversation_id,seq),FOREIGN KEY(company_id,conversation_id) REFERENCES conversations(company_id,id));
  CREATE TABLE IF NOT EXISTS leads(id TEXT NOT NULL,company_id TEXT NOT NULL,conversation_id TEXT NOT NULL,data TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('Nuova','Da contattare','In lavorazione','Completata')),summary TEXT NOT NULL,consent TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(company_id,id),UNIQUE(company_id,conversation_id),FOREIGN KEY(company_id,conversation_id) REFERENCES conversations(company_id,id));
  CREATE TABLE IF NOT EXISTS email_outbox(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),event_key TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,error TEXT,UNIQUE(company_id,event_key));
  CREATE TABLE IF NOT EXISTS trials(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS feedback(company_id TEXT NOT NULL,conversation_id TEXT NOT NULL,rating INTEGER NOT NULL,comment TEXT NOT NULL,PRIMARY KEY(company_id,conversation_id),FOREIGN KEY(company_id,conversation_id) REFERENCES conversations(company_id,id));
  CREATE INDEX IF NOT EXISTS leads_company_created ON leads(company_id,created_at);
  CREATE INDEX IF NOT EXISTS conversations_company_updated ON conversations(company_id,updated_at);
  ''')
  d.execute('INSERT OR IGNORE INTO companies VALUES (?,?,?,?)',('demo','demo',json.dumps(default_config('Azienda Demo Linea AI')),now()))
  d.execute('UPDATE companies SET config=? WHERE id=?',(json.dumps(services_config()),'demo'))
  from . import companies
  companies.init(d)
  from . import hybrid
  hybrid.init(d)
  from . import subscriptions
  subscriptions.init(d)
  from . import reviews
  reviews.init(d)
  d.execute('CREATE TABLE IF NOT EXISTS registration_consents(user_id TEXT PRIMARY KEY REFERENCES users(id), terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL, marketing_analysis INTEGER NOT NULL CHECK(marketing_analysis IN (0,1)), recorded_at TEXT NOT NULL)')
 DB.chmod(0o600)
def password_hash(password,salt=None):
 salt=salt or secrets.token_hex(16)
 h=hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
 return salt+':'+h
DUMMY=password_hash('not-a-real-account-password')
def register(email,password,name,consents=None):
 email=email.strip().lower()
 if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>200:raise ValueError('Email non valida.')
 if not isinstance(password,str) or not 12<=len(password)<=256:raise ValueError('Scegli una password di almeno 12 caratteri.')
 if not isinstance(name,str) or not 1<=len(name.strip())<=120:raise ValueError('Indica il nome dell’azienda.')
 cid=token();uid=token();cfg=default_config(name.strip())
 with connection() as d:
  try:
   d.execute('INSERT INTO companies VALUES (?,?,?,?)',(cid,token(),json.dumps(cfg),now()))
   d.execute('INSERT INTO company_management(company_id) VALUES (?)',(cid,))
   d.execute('INSERT INTO users VALUES (?,?,?,?)',(uid,cid,email,password_hash(password)))
   if consents is not None:
    if consents.get('terms') is not True or consents.get('privacy') is not True:raise ValueError('Leggi le condizioni e l’informativa prima di registrarti.')
    d.execute('INSERT INTO registration_consents VALUES (?,?,?,?,?)',(uid,'local-2026-09-19','local-2026-09-19',int(consents.get('marketing') is True),now()))
  except sqlite3.IntegrityError:raise ValueError('Registrazione non disponibile con questi dati. Prova ad accedere.')
 return login(email,password)
def login(email,password,remember=False):
 if not isinstance(email,str) or not isinstance(password,str) or len(password)>256:raise ValueError('Email o password non corrette.')
 with connection() as d:
  row=d.execute('SELECT * FROM users WHERE email=?',(email.strip().lower(),)).fetchone()
  stored=row['password'] if row else DUMMY
  if not hmac.compare_digest(password_hash(password,stored.split(':')[0]),stored) or not row:raise ValueError('Email o password non corrette.')
  value=token();d.execute('DELETE FROM auth_sessions WHERE expires<?',(time.time(),))
  d.execute('INSERT INTO auth_sessions VALUES (?,?,?)',(digest(value),row['id'],time.time()+(30*86400 if remember else 8*3600)))
  return value
class Unauthorized(Exception):pass
class Missing(Exception):pass
def principal(value):
 with connection() as d:
  r=d.execute('SELECT u.id,u.company_id,u.email FROM auth_sessions s JOIN users u ON s.user_id=u.id WHERE s.hash=? AND s.expires>?',(digest(value),time.time())).fetchone()
 if not r:raise Unauthorized()
 return dict(r)
def logout(value):
 with connection() as d:d.execute('DELETE FROM auth_sessions WHERE hash=?',(digest(value),))
def company(cid):
 with connection() as d:r=d.execute('SELECT * FROM companies WHERE id=?',(cid,)).fetchone()
 if not r:raise Missing()
 return dict(id=r['id'],public_id=r['public_id'],config=json.loads(r['config']))
def save_config(cid,data):
 previous=company(cid)['config']
 cfg=validate_config(dict(data,agent=data.get('agent',previous.get('agent',{}))))
 with connection() as d:
  d.execute('UPDATE companies SET config=? WHERE id=?',(json.dumps(cfg),cid))
  d.execute('UPDATE company_management SET config_version=config_version+1 WHERE company_id=?',(cid,))
 return cfg

def start_chat(public_id):
 with connection() as d:
  c=d.execute('SELECT * FROM companies WHERE public_id=?',(public_id,)).fetchone()
  if not c:raise Missing()
  return insert_chat(d,c)
def insert_chat(d,c):
 from .companies import snapshot
 cfg=snapshot(d,c['id'],c['config'])
 access=token();sid=token();stamp=now();state={'data':{},'history':[],'pending':False,'saved':False,'closed':False,'lead_id':None,'awaited':'','count':0,'notes':[],'additional_checked':False}
 d.execute('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?)',(sid,c['id'],digest(access),json.dumps(state),json.dumps(cfg),stamp,stamp,time.time()+3600))
 return access,cfg
def conversation(access):
 with connection() as d:
  r=d.execute('SELECT * FROM conversations WHERE access_hash=? AND expires>?',(digest(access),time.time())).fetchone()
  blocked=d.execute('SELECT 1 FROM installation_sessions s JOIN installations i ON i.id=s.installation_id JOIN company_management m ON m.company_id=i.company_id WHERE s.access_hash=? AND (i.enabled=0 OR m.verified=0)',(digest(access),)).fetchone()
  if blocked:raise Missing()
 if not r:raise Missing()
 return dict(r),json.loads(r['state']),json.loads(r['config'])
def persist_turn(row,state,user,reply,lead=None):
 stamp=now();cid=row['company_id'];sid=row['id']
 with connection() as d:
  if lead:
   from . import policy
   current=json.loads(d.execute('SELECT config FROM companies WHERE id=?',(cid,)).fetchone()[0])
   caps=policy.settings(current)['capabilities']
   if not caps['can_collect_leads']:raise ValueError('Raccolta richieste disabilitata.')
   if not caps['can_request_phone'] and lead['data'].get('telefono'):raise ValueError('Raccolta telefono disabilitata.')
   if not caps['can_request_email'] and lead['data'].get('email'):raise ValueError('Raccolta email disabilitata.')
   lid=state.get('lead_id') or token();state['lead_id']=lid
   summary='\n'.join(f'{k}: {v}' for k,v in lead['display'].items())
   d.execute('INSERT INTO leads VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(company_id,conversation_id) DO UPDATE SET data=excluded.data,summary=excluded.summary,updated_at=excluded.updated_at',(lid,cid,sid,json.dumps(lead['data'],ensure_ascii=False),'Nuova',summary,lead['consent'],stamp,stamp))
  seq=d.execute('SELECT COALESCE(MAX(seq),0) FROM messages WHERE company_id=? AND conversation_id=?',(cid,sid)).fetchone()[0]
  for i,(role,text) in enumerate([('user',user),('assistant',reply)],1):d.execute('INSERT INTO messages VALUES (?,?,?,?,?,?)',(cid,sid,seq+i,role,text,stamp))
  state['history']=(state['history']+[{'role':'user','content':user},{'role':'assistant','content':reply}])[-24:]
  if lead:
   from . import hybrid
   hybrid.after_lead(d,row,state,json.loads(row['config']),lead)
  state['count']+=1
  d.execute('UPDATE conversations SET state=?,updated_at=?,expires=? WHERE company_id=? AND id=?',(json.dumps(state,ensure_ascii=False),stamp,time.time()+3600,cid,sid))
def list_leads(cid):
 with connection() as d:rows=d.execute('SELECT id,data,status,summary,created_at,updated_at FROM leads WHERE company_id=? ORDER BY created_at DESC LIMIT 200',(cid,)).fetchall()
 return [dict(dict(r),data=json.loads(r['data'])) for r in rows]
def lead_detail(cid,lid):
 with connection() as d:
  r=d.execute('SELECT * FROM leads WHERE company_id=? AND id=?',(cid,lid)).fetchone()
  if not r:raise Missing()
  msgs=d.execute('SELECT role,content,created_at FROM messages WHERE company_id=? AND conversation_id=? ORDER BY seq',(cid,r['conversation_id'])).fetchall()
 return dict(dict(r),data=json.loads(r['data']),messages=[dict(m) for m in msgs])
def set_status(cid,lid,status):
 if status not in STATUSES:raise ValueError('Stato non valido.')
 with connection() as d:
  if d.execute('UPDATE leads SET status=?,updated_at=? WHERE company_id=? AND id=?',(status,now(),cid,lid)).rowcount!=1:raise Missing()
def list_conversations(cid):
 with connection() as d:rows=d.execute('SELECT id,created_at,updated_at FROM conversations WHERE company_id=? ORDER BY updated_at DESC LIMIT 100',(cid,)).fetchall()
 return [dict(r) for r in rows]
def conversation_detail(cid,sid):
 with connection() as d:
  if not d.execute('SELECT 1 FROM conversations WHERE company_id=? AND id=?',(cid,sid)).fetchone():raise Missing()
  return [dict(r) for r in d.execute('SELECT role,content,created_at FROM messages WHERE company_id=? AND conversation_id=? ORDER BY seq',(cid,sid))]


def create_reset(email):
 with connection() as d:
  d.execute('DELETE FROM password_resets WHERE expires<?',(time.time(),))
  user=d.execute('SELECT id,company_id,email FROM users WHERE email=?',(email.strip().lower(),)).fetchone()
  if not user:return None
  value=token()
  d.execute('DELETE FROM password_resets WHERE user_id=?',(user['id'],))
  d.execute('INSERT INTO password_resets VALUES (?,?,?)',(digest(value),user['id'],time.time()+1800))
  return dict(user),value

def reset_password(value,password):
 if not isinstance(password,str) or not 12<=len(password)<=256:raise ValueError('Scegli una password di almeno 12 caratteri.')
 encoded=password_hash(password)
 with connection() as d:
  d.execute('BEGIN IMMEDIATE')
  r=d.execute('SELECT user_id FROM password_resets WHERE hash=? AND expires>?',(digest(value),time.time())).fetchone()
  if not r:raise ValueError('Questo collegamento è scaduto o non è più valido. Richiedine uno nuovo.')
  d.execute('UPDATE users SET password=? WHERE id=?',(encoded,r['user_id']))
  d.execute('DELETE FROM password_resets WHERE user_id=?',(r['user_id'],))
  d.execute('DELETE FROM auth_sessions WHERE user_id=?',(r['user_id'],))


def export_company(cid):
 with connection() as d:
  conversations=[dict(r) for r in d.execute('SELECT id,created_at,updated_at FROM conversations WHERE company_id=?',(cid,))]
  leads=[dict(r) for r in d.execute('SELECT id,data,status,summary,consent,created_at,updated_at FROM leads WHERE company_id=?',(cid,))]
  messages=[dict(r) for r in d.execute('SELECT conversation_id,role,content,created_at FROM messages WHERE company_id=? ORDER BY conversation_id,seq',(cid,))]
  feedback=[dict(r) for r in d.execute('SELECT conversation_id,rating,comment FROM feedback WHERE company_id=?',(cid,))]
 from .companies import overview
 from .hybrid import company_data
 return dict(agent_activity=company_data(cid),company_configuration=company(cid)['config'],company_information=overview(cid),exported_at=now(),conversations=conversations,leads=leads,messages=messages,feedback=feedback)

def delete_conversation(cid,sid):
 with connection() as d:
  d.execute('BEGIN IMMEDIATE')
  if not d.execute('SELECT 1 FROM conversations WHERE company_id=? AND id=?',(cid,sid)).fetchone():raise Missing()
  leads=d.execute('SELECT id FROM leads WHERE company_id=? AND conversation_id=?',(cid,sid)).fetchall()
  for lead in leads:
   if d.execute("SELECT 1 FROM email_outbox WHERE company_id=? AND event_key=? AND status='sending'",(cid,'lead:'+lead['id'])).fetchone():raise ValueError('È in corso un invio per questa richiesta. Riprova tra poco.')
   d.execute('DELETE FROM email_outbox WHERE company_id=? AND event_key=?',(cid,'lead:'+lead['id']))
  d.execute('DELETE FROM installation_sessions WHERE access_hash IN (SELECT access_hash FROM conversations WHERE company_id=? AND id=?)',(cid,sid))
  d.execute('DELETE FROM crm_mock WHERE company_id=? AND lead_id IN (SELECT id FROM leads WHERE company_id=? AND conversation_id=?)',(cid,cid,sid))
  d.execute('DELETE FROM lead_intelligence WHERE company_id=? AND lead_id IN (SELECT id FROM leads WHERE company_id=? AND conversation_id=?)',(cid,cid,sid))
  d.execute('DELETE FROM bookings WHERE company_id=? AND conversation_id=?',(cid,sid))
  d.execute('DELETE FROM channel_sessions WHERE access_hash IN (SELECT access_hash FROM conversations WHERE company_id=? AND id=?)',(cid,sid))
  d.execute('DELETE FROM action_audit WHERE company_id=? AND conversation_id=?',(cid,sid))
  for table in ('company_reviews','feedback','messages','leads'):d.execute('DELETE FROM '+table+' WHERE company_id=? AND conversation_id=?',(cid,sid))
  d.execute('DELETE FROM conversations WHERE company_id=? AND id=?',(cid,sid))
