"""Provider-independent email queue, local capture and account verification."""
import html,json,time,re
from contextlib import nullcontext
from pathlib import Path
from . import store
from runtime_config import BASE_URL

def init(d):
 d.executescript("""CREATE TABLE IF NOT EXISTS email_details(id TEXT PRIMARY KEY REFERENCES email_outbox(id),html TEXT NOT NULL,mode TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS email_verification(user_id TEXT PRIMARY KEY REFERENCES users(id),verified_at TEXT);
 CREATE TABLE IF NOT EXISTS email_verification_tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires REAL NOT NULL);""")
 d.execute("CREATE TRIGGER IF NOT EXISTS email_details_cleanup AFTER DELETE ON email_outbox BEGIN DELETE FROM email_details WHERE id=OLD.id; END")
class EmailService:
 def send(self,cid,event,to,subject,text,*,connection=None):
  from . import mail
  if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',to) or any(x in subject for x in ['\r','\n']):raise ValueError('Destinatario o oggetto email non valido.')
  mode='smtp' if mail.config() else 'capture';status='pending' if mode=='smtp' else 'not_configured'
  body='<!doctype html><meta charset="utf-8"><h1>'+html.escape(subject)+'</h1><div style="white-space:pre-wrap">'+html.escape(text)+'</div>'
  with (nullcontext(connection) if connection is not None else store.connection()) as d:
   d.execute('INSERT OR IGNORE INTO email_outbox VALUES (?,?,?,?,?,?,?,?,?)',(store.token(),cid,event,to,subject,text,status,store.now(),None))
   row=d.execute('SELECT * FROM email_outbox WHERE company_id=? AND event_key=?',(cid,event)).fetchone()
   if (row['recipient'],row['subject'],row['body'])!=(to,subject,text):raise ValueError('Evento email già usato con contenuto diverso.')
   d.execute('INSERT OR IGNORE INTO email_details VALUES (?,?,?)',(row['id'],body,mode))
  return row['status']
 def notify(self,cid,event,to,kind,text):
  titles={'appointment':'Conferma appuntamento','support':'Richiesta al supporto','notification':'Notifica Linea AI','report':'Report Linea AI','registration':'Benvenuto in Linea AI'}
  if kind not in titles:raise ValueError('Tipo email non valido.')
  return self.send(cid,event,to,titles[kind],text)
service=EmailService()

def request_verification(user):
 token=store.token()
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  if d.execute('SELECT 1 FROM email_verification WHERE user_id=? AND verified_at IS NOT NULL',(user['id'],)).fetchone():return
  d.execute('DELETE FROM email_verification_tokens WHERE user_id=?',(user['id'],))
  d.execute('INSERT INTO email_verification_tokens VALUES (?,?,?)',(store.digest(token),user['id'],time.time()+86400))
  service.send(user['company_id'],'verify:'+store.digest(token),user['email'],'Verifica la tua email — Linea AI','Conferma il tuo indirizzo aprendo questo link entro 24 ore:\n'+BASE_URL+'/verifica-email.html#'+token+'\nSe non hai creato un account, ignora il messaggio.',connection=d)

def verify(token):
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE')
  row=d.execute('SELECT user_id FROM email_verification_tokens WHERE hash=? AND expires>?',(store.digest(token),time.time())).fetchone()
  if not row:raise ValueError('Collegamento scaduto o già utilizzato. Richiedi una nuova verifica.')
  d.execute('INSERT INTO email_verification VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET verified_at=excluded.verified_at',(row['user_id'],store.now()))
  d.execute('DELETE FROM email_verification_tokens WHERE user_id=?',(row['user_id'],))

def verified(user):
 with store.connection() as d:return bool(d.execute('SELECT 1 FROM email_verification WHERE user_id=? AND verified_at IS NOT NULL',(user['id'],)).fetchone())

def preview():
 folder=store.DB.parent/'email-preview';folder.mkdir(mode=0o700,parents=True,exist_ok=True)
 with store.connection() as d:rows=d.execute('SELECT e.*,h.html,h.mode FROM email_outbox e JOIN email_details h ON h.id=e.id ORDER BY created_at DESC').fetchall()
 cards=[]
 for row in rows:
  cards.append('<article><h2>'+html.escape(row['subject'])+'</h2><p>A: '+html.escape(row['recipient'])+' · '+html.escape(row['mode'])+' · '+html.escape(row['created_at'])+'</p><pre style="white-space:pre-wrap">'+html.escape(row['body'])+'</pre><details><summary>Codice HTML del messaggio</summary><pre>'+html.escape(row['html'])+'</pre></details><h3>Anteprima HTML</h3><h2>'+html.escape(row['subject'])+'</h2><div style="white-space:pre-wrap">'+html.escape(row['body'])+'</div></article>')
 path=folder/'index.html';path.write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>Email locali Linea AI</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:20px}article{border:1px solid #ddd;padding:20px;margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Email locali — riservato al gestore</h1><p>Nessun invio Internet in modalità capture. I link/token sono riservati: copia il collegamento nel browser per provarlo.</p>'+''.join(cards),encoding='utf-8');path.chmod(0o600);return path
if __name__=='__main__':store.init();print(preview())
