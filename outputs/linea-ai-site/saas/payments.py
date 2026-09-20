"""Local payment ledger and signed mock events; no card details or real money."""
import json,time,hmac,hashlib,os
from . import store

def init(d):
 d.executescript("""CREATE TABLE IF NOT EXISTS payment_ledger(id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),idempotency_key TEXT NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL,refunded INTEGER NOT NULL DEFAULT 0,created REAL NOT NULL,UNIQUE(company_id,idempotency_key));
 CREATE TABLE IF NOT EXISTS payment_events(event_id TEXT PRIMARY KEY,payment_id TEXT NOT NULL REFERENCES payment_ledger(id),digest TEXT NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,created REAL NOT NULL);""")
def create(d,cid,key,amount):
 if not isinstance(key,str) or not 1<=len(key)<=200 or type(amount)!=int or amount<=0:raise ValueError('Pagamento simulato non valido.')
 existing=d.execute('SELECT * FROM payment_ledger WHERE company_id=? AND idempotency_key=?',(cid,key)).fetchone()
 if existing:
  if existing['amount']!=amount:raise ValueError('Chiave già usata per un importo diverso.')
  return dict(existing)
 identifier=store.token();d.execute("INSERT INTO payment_ledger VALUES (?,?,?,?,'EUR','pending',0,?)",(identifier,cid,key,amount,time.time()))
 return dict(d.execute('SELECT * FROM payment_ledger WHERE id=?',(identifier,)).fetchone())
def apply(d,event):
 if not isinstance(event,dict) or set(event)!={'event_id','payment_id','kind','amount','currency'}:raise ValueError('Evento non valido.')
 eid=event['event_id'];kind=event['kind'];amount=event['amount']
 if not isinstance(eid,str) or not 1<=len(eid)<=200 or type(amount)!=int or amount<=0 or event['currency']!='EUR' or not isinstance(event['payment_id'],str) or not isinstance(kind,str):raise ValueError('Evento non valido.')
 encoded=json.dumps(event,sort_keys=True,separators=(',',':'));digest=store.digest(encoded)
 previous=d.execute('SELECT digest FROM payment_events WHERE event_id=?',(eid,)).fetchone()
 if previous:
  if previous['digest']!=digest:raise ValueError('Evento duplicato con contenuto differente.')
  return False
 row=d.execute('SELECT * FROM payment_ledger WHERE id=?',(event['payment_id'],)).fetchone()
 if not row:raise store.Missing()
 state=row['status'];refund=row['refunded']
 if kind in ('succeeded','failed','cancelled'):
  if amount!=row['amount']:raise ValueError('Importo non corrispondente.')
  if state==kind:pass
  elif state=='pending':state=kind
  else:raise ValueError('Transizione non consentita; stato finale già registrato.')
 elif kind=='refunded':
  if state not in ('succeeded','partially_refunded') or refund+amount>row['amount']:raise ValueError('Rimborso non consentito.')
  refund+=amount;state='refunded' if refund==row['amount'] else 'partially_refunded'
 else:raise ValueError('Tipo evento non supportato.')
 d.execute('UPDATE payment_ledger SET status=?,refunded=? WHERE id=?',(state,refund,row['id']))
 d.execute('INSERT INTO payment_events VALUES (?,?,?,?,?,?)',(eid,row['id'],digest,kind,amount,time.time()));return True

def renewal(d,cid,key,amount,success):
 row=create(d,cid,key,amount)
 apply(d,dict(event_id='renewal:'+row['id'],payment_id=row['id'],kind='succeeded' if success else 'failed',amount=amount,currency='EUR'))

def mock_charge(user,key,amount,outcome):
 if outcome not in ('succeeded','failed','cancelled'):raise ValueError('Esito simulato non valido.')
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE');row=create(d,user['company_id'],key,amount)
  apply(d,dict(event_id='mock:'+row['id'],payment_id=row['id'],kind=outcome,amount=amount,currency='EUR'))
  return row['id']
def refund(user,payment_id,amount,key):
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  if not d.execute('SELECT 1 FROM payment_ledger WHERE id=? AND company_id=?',(payment_id,user['company_id'])).fetchone():raise store.Missing()
  return apply(d,dict(event_id='refund:'+user['company_id']+':'+key,payment_id=payment_id,kind='refunded',amount=amount,currency='EUR'))
def webhook(payload,signature,timestamp):
 secret=os.environ.get('LINEA_PAYMENT_WEBHOOK_SECRET','')
 if len(secret)<32:raise ValueError('Webhook mock non configurato.')
 try:stamp=int(timestamp)
 except (ValueError,TypeError):raise ValueError('Timestamp non valido.')
 if abs(time.time()-stamp)>300:raise ValueError('Evento fuori finestra temporale.')
 canonical=json.dumps(payload,sort_keys=True,separators=(',',':'))
 expected=hmac.new(secret.encode(),(str(stamp)+'.'+canonical).encode(),hashlib.sha256).hexdigest()
 if not isinstance(signature,str) or not hmac.compare_digest(expected,signature):raise ValueError('Firma non valida.')
 with store.connection() as d:d.execute('BEGIN IMMEDIATE');return apply(d,payload)
def listing(user):
 with store.connection() as d:return [dict(x) for x in d.execute('SELECT id,amount,currency,status,refunded,created FROM payment_ledger WHERE company_id=? ORDER BY created DESC',(user['company_id'],))]
