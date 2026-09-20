"""Local-only commercial lifecycle. No network calls or payment credentials."""
import json,time,re,calendar,threading
from datetime import datetime,timezone
from urllib.parse import urlsplit
from typing import Protocol
from contextlib import nullcontext
from . import store
DAY=86400
GRACE_DAYS=7
PLANS={
 'demo':dict(name='Demo',trial_days=7,monthly_cents=0,available=True),
 'base':dict(name='Piano Base',trial_days=14,monthly_cents=29900,available=True),
 'plus':dict(name='Piano Plus',trial_days=14,monthly_cents=59900,available=True),
 'advanced':dict(name='Piano Advanced',trial_days=14,monthly_cents=99900,available=True),
}
DISCOUNT=15
METHODS={'card':('Carta — Visa, Mastercard, American Express',True),'apple_pay':('Apple Pay',True),'google_pay':('Google Pay',True),'sepa':('Addebito SEPA',True),'paypal':('PayPal',True),'revolut_pay':('Revolut Pay',True),'bank_transfer':('Bonifico bancario manuale',False)}
PROFILE_FIELDS={'legal_name':'Ragione sociale','vat':'Partita IVA / identificativo fiscale','website':'Sito ufficiale','business_email':'Email aziendale','business_phone':'Telefono aziendale','contact_name':'Nome e cognome del referente','contact_role':'Ruolo del referente','address':'Sede legale','city':'Città','postal_code':'CAP','country':'Paese (codice, es. IT)'}
class AccessRequired(Exception):pass

def init(d):
 d.executescript('''
 CREATE TABLE IF NOT EXISTS plan_demo_usage(email TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),started REAL NOT NULL,ends REAL NOT NULL);
 CREATE TABLE IF NOT EXISTS plan_profiles(company_id TEXT PRIMARY KEY REFERENCES companies(id),data TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','verified','rejected','needs_review')),updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS plan_subscriptions(company_id TEXT PRIMARY KEY REFERENCES companies(id),plan TEXT NOT NULL,period TEXT NOT NULL CHECK(period IN ('monthly','annual')),status TEXT NOT NULL CHECK(status IN ('trial','active','cancelled','past_due')),trial_start REAL NOT NULL,trial_end REAL NOT NULL,period_end REAL NOT NULL,cancel_at_end INTEGER NOT NULL DEFAULT 0,cancelled_at REAL,method_kind TEXT NOT NULL,customer_ref TEXT NOT NULL,method_ref TEXT NOT NULL,amount_cents INTEGER NOT NULL,provider TEXT NOT NULL DEFAULT 'mock');
 CREATE TABLE IF NOT EXISTS plan_events(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),actor TEXT NOT NULL,action TEXT NOT NULL,outcome TEXT NOT NULL,amount_cents INTEGER NOT NULL,created REAL NOT NULL);
 CREATE INDEX IF NOT EXISTS idx_plan_events_company_created ON plan_events(company_id,created);
 ''')

 # Versioned, repeatable migration: preserve subscriptions and add lifecycle state.
 sql=d.execute("SELECT sql FROM sqlite_master WHERE name='plan_subscriptions'").fetchone()[0]
 if "'expired'" not in sql:
  d.execute(re.sub(r'CREATE TABLE\s+"?plan_subscriptions"?', 'CREATE TABLE plan_subscriptions_v2',sql,count=1).replace("'cancelled','past_due'", "'cancelled','past_due','expired'"))
  d.execute('INSERT INTO plan_subscriptions_v2 SELECT * FROM plan_subscriptions')
  d.execute('DROP TABLE plan_subscriptions')
  d.execute('ALTER TABLE plan_subscriptions_v2 RENAME TO plan_subscriptions')
 columns={x[1] for x in d.execute('PRAGMA table_info(plan_subscriptions)')}
 for column,kind in [('grace_until','REAL'),('pending_plan','TEXT'),('pending_period','TEXT')]:
  if column not in columns:d.execute('ALTER TABLE plan_subscriptions ADD COLUMN '+column+' '+kind)
 d.execute("CREATE TABLE IF NOT EXISTS plan_commands(company_id TEXT NOT NULL REFERENCES companies(id),command_key TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(company_id,command_key))")

def amount(code,period):
 if code not in PLANS or not PLANS[code]['available'] or period not in ('monthly','annual'):raise ValueError('Piano o periodo non disponibile.')
 cents=PLANS[code]['monthly_cents']
 return cents if period=='monthly' else cents*12*(100-DISCOUNT)//100

def audit(d,cid,actor,action,outcome,cents=0,at=None):d.execute('INSERT INTO plan_events VALUES (?,?,?,?,?,?,?)',(store.token(),cid,actor,action,outcome,cents,time.time() if at is None else at))

def start_demo(user,at=None):
 from .email_service import require_verified
 require_verified(user)
 from .verification import allowed
 if not allowed(user['company_id']):raise ValueError('Azienda non abilitata.')
 stamp=time.time() if at is None else at;email=user['email'].strip().lower();cid=user['company_id']
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute('SELECT * FROM plan_demo_usage WHERE email=?',(email,)).fetchone()
  if row:
   if row['company_id']!=cid or row['ends']<=stamp:raise ValueError('La Demo è già stata utilizzata con questa email.')
   return dict(row)
  end=stamp+PLANS['demo']['trial_days']*DAY
  d.execute('INSERT INTO plan_demo_usage VALUES (?,?,?,?)',(email,cid,stamp,end));audit(d,cid,user['id'],'demo_started','local',at=stamp)
 return dict(started=stamp,ends=end)

def profile(cid,data,actor):
 from .engine import phone
 if not isinstance(data,dict) or set(data)!=set(PROFILE_FIELDS):raise ValueError('Compila i dati aziendali richiesti.')
 cleaned={}
 for key,label in PROFILE_FIELDS.items():
  value=data[key]
  if not isinstance(value,str) or not 1<=len(value.strip())<=250:raise ValueError('Controlla: '+label)
  cleaned[key]=value.strip()
 u=urlsplit(cleaned['website'])
 if u.scheme not in ('http','https') or not u.hostname or u.username or u.password:raise ValueError('Indica un sito completo, ad esempio https://azienda.it.')
 if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',cleaned['business_email']):raise ValueError('Controlla l’email aziendale.')
 if not phone(cleaned['business_phone'],cleaned['country'].upper()):raise ValueError('Controlla il numero aziendale e il codice Paese.')
 cleaned['country']=cleaned['country'].upper()
 if not re.fullmatch('[A-Z]{2}',cleaned['country']):raise ValueError('Indica il Paese con due lettere, ad esempio IT.')
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  old=d.execute('SELECT data FROM plan_profiles WHERE company_id=?',(cid,)).fetchone()
  if old and json.loads(old['data'])==cleaned:return
  d.execute("INSERT INTO plan_profiles VALUES (?,?,'pending',?) ON CONFLICT(company_id) DO UPDATE SET data=excluded.data,status='pending',updated_at=excluded.updated_at",(cid,json.dumps(cleaned),store.now()))
  from .verification import transition,status
  if status(cid,d)!='suspended':transition(d,cid,'under_review',actor,'Dati aziendali aggiornati')
  audit(d,cid,actor,'profile_submitted','pending')

class VerificationProvider(Protocol):
 def review(self,cid:str,outcome:str): ...
class LocalVerification:
 """Invoked only by operator CLI, never through a company-accessible approval route."""
 def review(self,cid,outcome):
  if outcome not in ('verified','rejected','needs_review'):raise ValueError('Esito non valido.')
  with store.connection() as d:
   if not d.execute('UPDATE plan_profiles SET status=?,updated_at=? WHERE company_id=?',(outcome,store.now(),cid)).rowcount:raise store.Missing()
   from .verification import transition
   import getpass
   transition(d,cid,'under_review' if outcome=='needs_review' else outcome,'local:'+getpass.getuser(),'Revisione locale del profilo commerciale')
   audit(d,cid,'local_operator','company_review',outcome)

class PaymentProvider(Protocol):
 def create_method(self,cid:str,kind:str): ...
 def charge(self,customer_ref:str,method_ref:str,amount_cents:int,event_key:str): ...
class MockPaymentProvider:
 def create_method(self,cid,kind):
  if kind not in METHODS or not METHODS[kind][1]:raise ValueError('Il bonifico ordinario è manuale: scegli un metodo ricorrente per la prova con rinnovo automatico.')
  return 'mock_customer_'+store.digest(cid)[:20],'mock_method_'+store.token()
 def charge(self,customer_ref,method_ref,amount_cents,event_key):return True

PROVIDER=MockPaymentProvider()
def next_period(start,period):
 t=datetime.fromtimestamp(start,timezone.utc);m=t.month+(12 if period=='annual' else 1);y=t.year+(m-1)//12;m=(m-1)%12+1
 return t.replace(year=y,month=m,day=min(t.day,calendar.monthrange(y,m)[1])).timestamp()

def start_base(user,period,kind,confirmed,at=None,plan='base'):
 from .email_service import require_verified
 require_verified(user)
 from .verification import allowed
 if not allowed(user['company_id']):raise ValueError('Azienda non abilitata.')
 if plan not in ('base','plus','advanced'):raise ValueError('Piano non disponibile.')
 if confirmed is not True:raise ValueError('Conferma la prova e il rinnovo simulato.')
 cents=amount(plan,period);stamp=time.time() if at is None else at;cid=user['company_id']
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  p=d.execute('SELECT status FROM plan_profiles WHERE company_id=?',(cid,)).fetchone()
  if not p or p['status']!='verified':raise ValueError('Completa i dati e attendi la verifica del gestore prima di iniziare la prova.')
  if d.execute('SELECT 1 FROM plan_subscriptions WHERE company_id=?',(cid,)).fetchone():raise ValueError('Esiste già una prova o un piano per questa azienda. La prova non può essere riattivata.')
  customer,method=PROVIDER.create_method(cid,kind);end=stamp+PLANS['base']['trial_days']*DAY
  d.execute('INSERT INTO plan_subscriptions(company_id,plan,period,status,trial_start,trial_end,period_end,method_kind,customer_ref,method_ref,amount_cents) VALUES (?,?,?,\'trial\',?,?,?,?,?,?,?)',(cid,plan,period,stamp,end,end,kind,customer,method,cents))
  audit(d,cid,user['id'],plan+'_trial_started','mock',at=stamp)

def cancel(user,at=None):
 stamp=time.time() if at is None else at;cid=user['company_id']
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  s=d.execute('SELECT * FROM plan_subscriptions WHERE company_id=?',(cid,)).fetchone()
  if not s:raise store.Missing()
  if s['status'] in ('cancelled','expired') or s['cancel_at_end']:return
  d.execute('UPDATE plan_subscriptions SET cancel_at_end=1,cancelled_at=? WHERE company_id=?',(stamp,cid))
  audit(d,cid,user['id'],'renewal_cancelled','mock',at=stamp)

def process_due(cid=None,at=None,provider=None):
 stamp=time.time() if at is None else at;provider=provider or PROVIDER
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  sql="SELECT * FROM plan_subscriptions WHERE status IN ('trial','active','past_due') AND period_end<=?";args=[stamp]
  if cid:sql+=' AND company_id=?';args.append(cid)
  for s in d.execute(sql,args).fetchall():
   company=s['company_id']
   from .verification import status
   if status(company,d) in ('suspended','rejected'):continue
   if s['cancel_at_end']:
    d.execute("UPDATE plan_subscriptions SET status='cancelled' WHERE company_id=?",(company,));audit(d,company,'scheduler','subscription_ended','mock',at=stamp);continue
   if s['status']=='past_due':
    if (s['grace_until'] or s['period_end']+GRACE_DAYS*DAY)<=stamp:
     d.execute("UPDATE plan_subscriptions SET status='expired' WHERE company_id=?",(company,));audit(d,company,'scheduler','grace_expired','expired',at=stamp)
    continue
   plan=s['pending_plan'] or s['plan'];period=s['pending_period'] or s['period'];cents=amount(plan,period)
   key=company+':'+str(s['period_end'])
   ok=provider.charge(s['customer_ref'],s['method_ref'],cents,key)
   from .payments import renewal
   renewal(d,company,'subscription:'+key,cents,ok)
   # The local provider is transactional. A future external provider must use an outbox + idempotency key.
   end=next_period(stamp,period) if ok else s['period_end']
   d.execute('UPDATE plan_subscriptions SET status=?,period_end=? WHERE company_id=?',('active' if ok else 'past_due',end,company))
   if ok:d.execute('UPDATE plan_subscriptions SET plan=?,period=?,amount_cents=?,pending_plan=NULL,pending_period=NULL,grace_until=NULL WHERE company_id=?',(plan,period,cents,company))
   else:d.execute('UPDATE plan_subscriptions SET grace_until=? WHERE company_id=?',(stamp+GRACE_DAYS*DAY,company))
   audit(d,company,'scheduler','payment','mock_success' if ok else 'mock_failure',cents,stamp)

def access(user,at=None):
 from .email_service import verified
 from .verification import allowed
 return verified(user) and allowed(user['company_id']) and bool(entitlements(user['company_id'],at).get('dashboard'))
def require_access(user):
 from .email_service import require_verified
 require_verified(user)
 if not access(user):raise AccessRequired()

def entitlements(cid,at=None,connection=None):
 from .verification import status
 if status(cid,connection) in ('suspended','rejected'):return {}
 stamp=time.time() if at is None else at
 if connection is None:process_due(cid,stamp)
 with (nullcontext(connection) if connection is not None else store.connection()) as d:
  row=d.execute('SELECT * FROM plan_subscriptions WHERE company_id=?',(cid,)).fetchone()
  demo=d.execute('SELECT 1 FROM plan_demo_usage WHERE company_id=? AND ends>?',(cid,stamp)).fetchone()
 active=row and ((row['status'] in ('trial','active') and row['period_end']>stamp) or (row['status']=='past_due' and (row['grace_until'] or 0)>stamp))
 plan=row['plan'] if active else 'demo' if demo and not row else None
 if not plan:return {}
 from .plan_entitlements import PLAN_ENTITLEMENTS
 return dict(PLAN_ENTITLEMENTS[plan])

def require_feature(cid,feature):
 if not entitlements(cid).get(feature,False):raise AccessRequired()

def change_plan(user,plan,period,confirmed):
 from .email_service import require_verified
 require_verified(user)
 from .verification import allowed
 if not allowed(user['company_id']):raise ValueError('Azienda non abilitata.')
 if confirmed is not True or plan not in ('base','plus','advanced'):raise ValueError('Conferma il nuovo piano e il periodo.')
 amount(plan,period)
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute('SELECT * FROM plan_subscriptions WHERE company_id=?',(user['company_id'],)).fetchone()
  if not row or row['status'] not in ('trial','active') or row['cancel_at_end']:raise ValueError('Il piano non permette cambi programmati.')
  if row['pending_plan']==plan and row['pending_period']==period:return
  d.execute('UPDATE plan_subscriptions SET pending_plan=?,pending_period=? WHERE company_id=?',(plan,period,user['company_id']))
  audit(d,user['company_id'],user['id'],'plan_change_scheduled',plan+':'+period)

def reactivate(user,key,confirmed,at=None,provider=None):
 from .email_service import require_verified
 from .verification import allowed
 require_verified(user)
 if not allowed(user['company_id']):raise ValueError('Azienda non abilitata.')
 if confirmed is not True or not isinstance(key,str) or not 1<=len(key)<=100:raise ValueError('Conferma la riattivazione simulata.')
 stamp=time.time() if at is None else at;cid=user['company_id'];provider=provider or PROVIDER
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  if d.execute('SELECT 1 FROM plan_commands WHERE company_id=? AND command_key=?',(cid,key)).fetchone():return
  row=d.execute('SELECT * FROM plan_subscriptions WHERE company_id=?',(cid,)).fetchone()
  if not row:raise store.Missing()
  if row['status'] in ('active','trial') and row['period_end']>stamp:
   d.execute('UPDATE plan_subscriptions SET cancel_at_end=0,cancelled_at=NULL WHERE company_id=?',(cid,));outcome='renewal_restored'
  else:
   profile=d.execute('SELECT status FROM plan_profiles WHERE company_id=?',(cid,)).fetchone()
   if not profile or profile['status']!='verified':raise ValueError('È necessaria la verifica aziendale.')
   plan=row['pending_plan'] or row['plan'];period=row['pending_period'] or row['period'];cents=amount(plan,period)
   ok=provider.charge(row['customer_ref'],row['method_ref'],cents,cid+':reactivate:'+key)
   from .payments import renewal
   renewal(d,cid,'reactivate:'+key,cents,ok)
   if ok:
    d.execute("UPDATE plan_subscriptions SET status='active',plan=?,period=?,amount_cents=?,period_end=?,cancel_at_end=0,cancelled_at=NULL,grace_until=NULL,pending_plan=NULL,pending_period=NULL WHERE company_id=?",(plan,period,cents,next_period(stamp,period),cid));outcome='mock_success'
   else:outcome='mock_failure'
  d.execute('INSERT INTO plan_commands VALUES (?,?,?)',(cid,key,outcome));audit(d,cid,user['id'],'reactivate',outcome,at=stamp)

def state(user):
 from .verification import status as company_status
 cid=user['company_id'];process_due(cid)
 with store.connection() as d:
  demo=d.execute('SELECT started,ends FROM plan_demo_usage WHERE email=? AND company_id=?',(user['email'].lower(),cid)).fetchone()
  profile=d.execute('SELECT data,status FROM plan_profiles WHERE company_id=?',(cid,)).fetchone()
  sub=d.execute('SELECT plan,period,status,trial_start,trial_end,period_end,cancel_at_end,method_kind,amount_cents,grace_until,pending_plan,pending_period FROM plan_subscriptions WHERE company_id=?',(cid,)).fetchone()
  events=[dict(r) for r in d.execute('SELECT action,outcome,amount_cents,created FROM plan_events WHERE company_id=? ORDER BY created DESC LIMIT 30',(cid,))]
 return dict(demo=dict(demo) if demo else None,profile=dict(data=json.loads(profile['data']),status=profile['status']) if profile else None,subscription=dict(sub) if sub else None,company_status=company_status(cid),events=events,mode='mock',entitlements=entitlements(cid),grace_days=GRACE_DAYS)

def catalogue(user):
 current=state(user);now=time.time();cards=[]
 for code,p in PLANS.items():
  if code=='demo' and current['demo'] and current['demo']['ends']<=now:continue
  cards.append(dict(code=code,**p,annual_cents=amount(code,'annual') if p['available'] else None,annual_monthly_cents=amount(code,'annual')//12 if p['available'] else None))
 return dict(authenticated=True,plans=cards,discount=DISCOUNT,**current)

def worker(stop):
 while not stop.is_set():
  try:process_due()
  except Exception:pass
  stop.wait(30)
def start_worker(stop=None):
 stop=stop or threading.Event();thread=threading.Thread(target=worker,args=(stop,),daemon=True);thread.start();return thread

PATHS={'/api/plans','/api/plan-state','/api/plan-profile','/api/plan-demo','/api/plan-base','/api/plan-cancel','/api/plan-method','/api/plan-change','/api/plan-reactivate'}
def route(h,path,b):
 from .api import cookie
 try:u=store.principal(cookie(h))
 except store.Unauthorized:
  if path=='/api/plans' and h.command=='GET':return 200,{'authenticated':False,'discount':DISCOUNT,'plans':[dict(code=k,name=v['name'],trial_days=v['trial_days'],available=v['available']) for k,v in PLANS.items()]}
  raise
 if path=='/api/plans' and h.command=='GET':return 200,catalogue(u)
 if path=='/api/plan-state' and h.command=='GET':return 200,dict(**state(u),fields=PROFILE_FIELDS,methods=[dict(code=k,label=v[0],recurring=v[1]) for k,v in METHODS.items()])
 if h.command!='POST':return 405,{'error':'Operazione non disponibile.'}
 if path=='/api/plan-change':
  if set(b)!={'plan','period','confirm'}:raise ValueError('Campi non validi.')
  change_plan(u,b['plan'],b['period'],b['confirm'])
 elif path=='/api/plan-reactivate':
  if set(b)!={'key','confirm'}:raise ValueError('Campi non validi.')
  reactivate(u,b['key'],b['confirm'])
 elif path=='/api/plan-demo':start_demo(u)
 elif path=='/api/plan-profile':profile(u['company_id'],b,u['id'])
 elif path=='/api/plan-base':
  if set(b)-{'period','method','confirm','plan'}:raise ValueError('Non inserire dati bancari reali: questa è una simulazione.')
  start_base(u,b.get('period'),b.get('method'),b.get('confirm'),plan=b.get('plan','base'))
 elif path=='/api/plan-method':
  if set(b)!={'method'}:raise ValueError('Indica soltanto il metodo simulato.')
  customer,method=PROVIDER.create_method(u['company_id'],b.get('method'))
  with store.connection() as d:
   if not d.execute('UPDATE plan_subscriptions SET method_kind=?,customer_ref=?,method_ref=? WHERE company_id=?',(b['method'],customer,method,u['company_id'])).rowcount:raise store.Missing()
   audit(d,u['company_id'],u['id'],'payment_method_updated','mock')
 elif path=='/api/plan-cancel':cancel(u)
 else:return 405,{'error':'Operazione non disponibile.'}
 return 200,{'ok':True}

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser(description='Revisione aziendale locale: nessuna verifica esterna automatica.')
 parser.add_argument('company_id');parser.add_argument('outcome',choices=['verified','rejected','needs_review']);args=parser.parse_args();store.init();LocalVerification().review(args.company_id,args.outcome);print('Esito locale registrato.')
