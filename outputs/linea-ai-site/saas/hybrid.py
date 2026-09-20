"""Persistenza additiva di azioni, instradamento e metriche; nessun servizio esterno."""
import json,re
from . import store,policy
STAGES=('nuovo','contattato','appuntamento','qualificato','vendita','perso')
MODES=('AI_ACTIVE','HANDOFF_REQUESTED','HUMAN_ACTIVE','CLOSED')
def init(d):
 d.executescript('''
 CREATE TABLE IF NOT EXISTS action_audit(id INTEGER PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),conversation_id TEXT,actor TEXT NOT NULL,action TEXT NOT NULL,outcome TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS booking_slots(id TEXT NOT NULL,company_id TEXT NOT NULL REFERENCES companies(id),starts TEXT NOT NULL,label TEXT NOT NULL,PRIMARY KEY(company_id,id));
 CREATE TABLE IF NOT EXISTS bookings(id TEXT NOT NULL,company_id TEXT NOT NULL,conversation_id TEXT NOT NULL,slot_id TEXT NOT NULL,confirmed_at TEXT NOT NULL,PRIMARY KEY(company_id,id),UNIQUE(company_id,slot_id),UNIQUE(company_id,conversation_id),FOREIGN KEY(company_id,slot_id) REFERENCES booking_slots(company_id,id),FOREIGN KEY(company_id,conversation_id) REFERENCES conversations(company_id,id));
 CREATE TABLE IF NOT EXISTS lead_intelligence(company_id TEXT NOT NULL,lead_id TEXT NOT NULL,score INTEGER NOT NULL,reasons TEXT NOT NULL,department TEXT NOT NULL,stage TEXT NOT NULL DEFAULT 'nuovo',PRIMARY KEY(company_id,lead_id),FOREIGN KEY(company_id,lead_id) REFERENCES leads(company_id,id));
 CREATE TABLE IF NOT EXISTS crm_mock(company_id TEXT NOT NULL,lead_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(company_id,lead_id),FOREIGN KEY(company_id,lead_id) REFERENCES leads(company_id,id));
 CREATE TABLE IF NOT EXISTS channel_bindings(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),channel TEXT NOT NULL,secret_hash TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS channel_sessions(binding_id TEXT NOT NULL REFERENCES channel_bindings(id),external_id TEXT NOT NULL,access_hash TEXT NOT NULL,PRIMARY KEY(binding_id,external_id));
 CREATE TABLE IF NOT EXISTS public_sources(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),url TEXT NOT NULL,UNIQUE(company_id,url));
 CREATE TABLE IF NOT EXISTS public_revisions(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),source_id TEXT NOT NULL REFERENCES public_sources(id),content TEXT NOT NULL,hash TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,approved_at TEXT,UNIQUE(source_id,hash));
 ''')
def audit(d,cid,sid,actor,action,outcome):
 d.execute('INSERT INTO action_audit(company_id,conversation_id,actor,action,outcome,created_at) VALUES (?,?,?,?,?,?)',(cid,sid,actor,action,outcome,store.now()))
def match(rule,data):
 value=str(data.get(rule['field'],''));want=rule.get('value','');op=rule['op']
 if op=='present':return bool(value.strip())
 if op=='contains':return bool(want) and want.casefold() in value.casefold()
 if op=='equals':return value.casefold()==want.casefold()
 if op=='gte':
  try:return float(value)>=float(want)
  except (ValueError,TypeError):return False
 return False

def intelligence(cfg,data):
 rules=policy.settings(cfg);reasons=[{'label':r['label'],'points':r['points']} for r in rules['scoring'] if match(r,data)]
 score=min(100,sum(r['points'] for r in reasons));department=next((r for r in rules['departments'] if match(r,data)),{})
 return dict(score=score,priority='alta' if score>=70 else 'media' if score>=40 else 'standard',reasons=reasons,department={k:department.get(k,'') for k in ('name','recipient','site')})
def after_lead(d,row,state,cfg,lead):
 cid=row['company_id'];lid=state['lead_id'];info=intelligence(cfg,lead['data'])
 d.execute('INSERT INTO lead_intelligence(company_id,lead_id,score,reasons,department) VALUES (?,?,?,?,?) ON CONFLICT(company_id,lead_id) DO UPDATE SET score=excluded.score,reasons=excluded.reasons,department=excluded.department',(cid,lid,info['score'],json.dumps(info['reasons']),json.dumps(info['department'])))
 # Same transaction as the lead. Local mock only, current permissions must allow it.
 current=json.loads(d.execute('SELECT config FROM companies WHERE id=?',(cid,)).fetchone()[0]);caps=policy.settings(cfg)['capabilities'];live=policy.settings(current)['capabilities']
 from .subscriptions import entitlements
 features=entitlements(cid,connection=d)
 if features.get('crm') and policy.settings(cfg)['crm_auto'] and policy.settings(current)['crm_auto'] and caps['can_send_to_crm'] and live['can_send_to_crm']:
  from .adapters import MockCRM
  MockCRM().send(d,cid,lid,dict(company_id=cid,lead_id=lid,data=lead['data'],consent=lead['consent'],summary=lead['display'],intelligence=info,origin=state.get('channel','web'),conversation_id=row['id'],conversation=[dict(m) for m in d.execute('SELECT role,content,created_at FROM messages WHERE company_id=? AND conversation_id=? ORDER BY seq',(cid,row['id']))]))
  audit(d,cid,row['id'],'agent','crm_mock','saved')
def company_data(cid):
 with store.connection() as d:
  infos=[dict(r) for r in d.execute('SELECT * FROM lead_intelligence WHERE company_id=?',(cid,))]
  actions=[dict(r) for r in d.execute('SELECT * FROM action_audit WHERE company_id=? ORDER BY id DESC LIMIT 200',(cid,))]
  bookings=[dict(r) for r in d.execute('SELECT b.id,b.conversation_id,s.starts,s.label FROM bookings b JOIN booking_slots s ON s.company_id=b.company_id AND s.id=b.slot_id WHERE b.company_id=?',(cid,))]
  langs={};modes={}
  for r in d.execute('SELECT state FROM conversations WHERE company_id=?',(cid,)):
   st=json.loads(r[0]);lang=st.get('language','it');mode=st.get('mode','AI_ACTIVE');langs[lang]=langs.get(lang,0)+1;modes[mode]=modes.get(mode,0)+1
 return dict(intelligence=infos,actions=actions,bookings=bookings,languages=langs,modes=modes)
def stage(cid,lid,value,actor):
 if value not in STAGES:raise ValueError('Esito commerciale non valido.')
 store.lead_detail(cid,lid)
 with store.connection() as d:
  d.execute('INSERT OR IGNORE INTO lead_intelligence VALUES (?,?,0,\'[]\',\'{}\',\'nuovo\')',(cid,lid))
  d.execute('UPDATE lead_intelligence SET stage=? WHERE company_id=? AND lead_id=?',(value,cid,lid));audit(d,cid,None,actor,'lead_stage',value)
def handoff(cid,sid,mode,actor,message=''):
 from .subscriptions import require_feature
 require_feature(cid,'handoff')
 if mode not in MODES:raise ValueError('Stato non valido.')
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute('SELECT * FROM conversations WHERE company_id=? AND id=?',(cid,sid)).fetchone()
  if not row:raise store.Missing()
  st=json.loads(row['state']);cfg=json.loads(row['config'])
  current=json.loads(d.execute('SELECT config FROM companies WHERE id=?',(cid,)).fetchone()[0])
  if not policy.settings(cfg)['capabilities']['can_handoff_to_human'] or not policy.settings(current)['capabilities']['can_handoff_to_human']:raise ValueError('Passaggio a un operatore non autorizzato.')
  old=st.get('mode','AI_ACTIVE');allowed={'AI_ACTIVE':('HANDOFF_REQUESTED',),'HANDOFF_REQUESTED':('HUMAN_ACTIVE','AI_ACTIVE','CLOSED'),'HUMAN_ACTIVE':('HUMAN_ACTIVE','AI_ACTIVE','CLOSED'),'CLOSED':()}
  if mode not in allowed[old]:raise ValueError('Transizione non disponibile.')
  if message and (mode!='HUMAN_ACTIVE' or not isinstance(message,str) or len(message)>2000):raise ValueError('Messaggio operatore non valido.')
  st['mode']=mode;st['closed']=mode=='CLOSED'
  if message:
   seq=d.execute('SELECT COALESCE(MAX(seq),0)+1 FROM messages WHERE company_id=? AND conversation_id=?',(cid,sid)).fetchone()[0]
   d.execute('INSERT INTO messages VALUES (?,?,?,?,?,?)',(cid,sid,seq,'human',message,store.now()))
   st['history']=(st['history']+[{'role':'assistant','content':message}])[-24:]
  d.execute('UPDATE conversations SET state=?,updated_at=? WHERE company_id=? AND id=?',(json.dumps(st),store.now(),cid,sid));audit(d,cid,sid,actor,'handoff',mode)
 return mode
