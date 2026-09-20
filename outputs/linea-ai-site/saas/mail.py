"""Coda transazionale. Nessuna conferma di invio senza accettazione SMTP."""
import threading,json
from . import store
from runtime_config import SMTP_FILE,smtp,ENV
from .email_transport import SMTPTransport
CONFIG=SMTP_FILE
def config():
 if ENV=='test':return None
 override=smtp()
 if override:return override if all(override.values()) else None
 if not CONFIG.exists():return None
 try:d=json.loads(CONFIG.read_text())
 except (ValueError,OSError):return None
 return d if isinstance(d,dict) and all(d.get(k) for k in ('host','port','username','password','sender')) else None
def enqueue(cid,event,to,subject,body):
 from .email_service import service
 return service.send(cid,event,to,subject,body)
def deliver_one(sender=None):
 cfg=config()
 if not cfg and sender is None:return False
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  query="SELECT * FROM email_outbox WHERE status IN ('pending','not_configured')"
  if sender is None:query+=" AND NOT EXISTS(SELECT 1 FROM email_details h WHERE h.id=email_outbox.id AND h.mode='capture')"
  row=d.execute(query+' ORDER BY created_at LIMIT 1').fetchone()
  if not row:return False
  d.execute("UPDATE email_outbox SET status='sending' WHERE id=?",(row['id'],))
 try:
  if sender:sender(dict(row))
  else:
   payload=dict(row)
   with store.connection() as d:detail=d.execute('SELECT html FROM email_details WHERE id=?',(row['id'],)).fetchone()
   if detail:payload['html']=detail['html']
   SMTPTransport().send(payload,cfg)
  status='sent';err=None
 except Exception as e:status='uncertain';err=type(e).__name__
 with store.connection() as d:d.execute('UPDATE email_outbox SET status=?,error=? WHERE id=?',(status,err,row['id']))
 return True
def worker(stop):
 while not stop.is_set():
  try:deliver_one()
  except Exception:pass
  stop.wait(10)
def start(stop=None):
 stop=stop or threading.Event()
 # Dopo un arresto durante l'invio non si reinvia alla cieca.
 with store.connection() as d:d.execute("UPDATE email_outbox SET status='uncertain',error='Interrupted' WHERE status='sending'")
 thread=threading.Thread(target=worker,args=(stop,),daemon=True);thread.start();return thread
def status(cid):
 with store.connection() as d:rows=d.execute('SELECT status,COUNT(*) AS count FROM email_outbox WHERE company_id=? GROUP BY status',(cid,)).fetchall()
 return {'configured':bool(config()),'counts':{r['status']:r['count'] for r in rows}}
