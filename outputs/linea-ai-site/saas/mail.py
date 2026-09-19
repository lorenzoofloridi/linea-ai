"""Coda transazionale. Nessuna conferma di invio senza accettazione SMTP."""
import os,ssl,smtplib,threading,time,json
from email.message import EmailMessage
from pathlib import Path
from . import store
CONFIG=Path(__file__).resolve().parents[1]/'private-data/email.json'
def config():
 if not CONFIG.exists():return None
 try:d=json.loads(CONFIG.read_text())
 except (ValueError,OSError):return None
 return d if isinstance(d,dict) and all(d.get(k) for k in ('host','port','username','password','sender')) else None
def enqueue(cid,event,to,subject,body):
 status='pending' if config() else 'not_configured'
 with store.connection() as d:d.execute('INSERT OR IGNORE INTO email_outbox VALUES (?,?,?,?,?,?,?,?,?)',(store.token(),cid,event,to,subject,body,status,store.now(),None))
 return status
def deliver_one(sender=None):
 cfg=config()
 if not cfg and sender is None:return False
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute("SELECT * FROM email_outbox WHERE status IN ('pending','not_configured') ORDER BY created_at LIMIT 1").fetchone()
  if not row:return False
  d.execute("UPDATE email_outbox SET status='sending' WHERE id=?",(row['id'],))
 try:
  if sender:sender(dict(row))
  else:
   msg=EmailMessage();msg['From']=cfg['sender'];msg['To']=row['recipient'];msg['Subject']=row['subject'];msg['Message-ID']='<'+row['id']+'@linea-ai.local>';msg.set_content(row['body'])
   if int(cfg['port'])==465:
    smtp=smtplib.SMTP_SSL(cfg['host'],465,timeout=20,context=ssl.create_default_context())
   else:
    smtp=smtplib.SMTP(cfg['host'],int(cfg['port']),timeout=20);smtp.starttls(context=ssl.create_default_context())
   with smtp:
    smtp.login(cfg['username'],cfg['password']);refused=smtp.send_message(msg)
    if refused:raise RuntimeError('Destinatario rifiutato')
  status='sent';err=None
 except Exception as e:status='uncertain';err=type(e).__name__
 with store.connection() as d:d.execute('UPDATE email_outbox SET status=?,error=? WHERE id=?',(status,err,row['id']))
 return True
def worker():
 while True:
  try:deliver_one()
  except Exception:pass
  time.sleep(10)
def start():
 # Dopo un arresto durante l'invio non si reinvia alla cieca.
 with store.connection() as d:d.execute("UPDATE email_outbox SET status='uncertain',error='Interrupted' WHERE status='sending'")
 threading.Thread(target=worker,daemon=True).start()
def status(cid):
 with store.connection() as d:rows=d.execute('SELECT status,COUNT(*) AS count FROM email_outbox WHERE company_id=? GROUP BY status',(cid,)).fetchall()
 return {'configured':bool(config()),'counts':{r['status']:r['count'] for r in rows}}
