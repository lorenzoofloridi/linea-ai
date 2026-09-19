import json,re,time,threading,sqlite3
from http.cookies import SimpleCookie
from urllib.parse import urlsplit
from . import store,engine,mail,companies,subscriptions
MODEL_LOCK=threading.Lock();RATE_LOCK=threading.Lock();RATES={}
def limit(key,maximum,window=3600):
 now=time.monotonic()
 with RATE_LOCK:
  for k in list(RATES):
   if RATES[k][1]<now:del RATES[k]
  count,expiry=RATES.get(key,(0,now+window))
  if count>=maximum:raise Limited()
  RATES[key]=(count+1,expiry)
class Limited(Exception):pass
def text(b,k,maximum=200,required=True):
 v=b.get(k,'')
 if not isinstance(v,str) or len(v)>maximum or (required and not v.strip()):raise ValueError('Controlla i campi richiesti.')
 return v.strip()
def body(h):
 if h.headers.get('Content-Type','').split(';')[0]!='application/json':raise ValueError('Formato non valido.')
 size=int(h.headers.get('Content-Length','0'))
 if not 0<size<=32000:raise ValueError('Richiesta troppo grande.')
 b=json.loads(h.rfile.read(size))
 if not isinstance(b,dict):raise ValueError('Formato non valido.')
 return b
def cookie(h):
 c=SimpleCookie()
 try:c.load(h.headers.get('Cookie',''));return c['linea_session'].value if 'linea_session' in c else ''
 except Exception:return ''
def set_cookie(h,value,clear=False,remember=False):
 h.extra_headers=[('Set-Cookie','linea_session='+value+'; Path=/; HttpOnly; SameSite=Strict'+('; Max-Age=0' if clear else '; Max-Age=2592000' if remember else ''))]
def handle(h):
 try:return route(h)
 except subscriptions.AccessRequired:return 402,{'error':'Attiva una Demo o un piano per accedere al tuo Spazio Aziendale.','redirect':'/#contatti'}
 except store.Unauthorized:return 401,{'error':'Accedi al tuo account per continuare.'}
 except store.Missing:return 404,{'error':'Risorsa non disponibile.'}
 except Limited:return 429,{'error':'Troppe richieste. Riprova tra poco.'}
 except json.JSONDecodeError:return 400,{'error':'Richiesta non valida.'}
 except (ValueError,KeyError,TypeError) as e:return 400,{'error':str(e) if isinstance(e,ValueError) and str(e) else 'Controlla i dati inseriti.'}
 except sqlite3.Error:return 503,{'error':'Al momento non riesco a registrare la richiesta. Riprova tra poco.'}
def route(h):
 path=urlsplit(h.path).path;b=body(h) if h.command=='POST' else {};ip=h.client_address[0]
 if path=='/api/site-reviews':
  from . import reviews
  if h.command=='GET':return 200,reviews.public()
  if h.command=='POST':
   limit(('reviews',ip),5,3600);reviews.submit(b);return 201,{'ok':True}
  return 405,{'error':'Operazione non disponibile.'}
 if path in subscriptions.PATHS:
  limit(('plans',ip),100,900)
  return subscriptions.route(h,path,b)
 from . import hybrid_api
 if path in ('/api/agent-settings','/api/agent-activity','/api/human','/api/lead-stage','/api/local-slot','/api/source-revisions','/api/source-approve','/api/agent-state','/api/booking-slots','/api/booking-confirm','/api/request-human','/api/voice-mock'):
  limit(('hybrid',ip),200,900)
  if not MODEL_LOCK.acquire(False):raise Limited()
  try:return hybrid_api.route(h,path,b)
  finally:MODEL_LOCK.release()
 if path=='/api/health' and h.command=='GET':
  ready=False
  try:
   from urllib.request import urlopen
   from llm_locale import modello_attivo
   with urlopen('http://127.0.0.1:11434/api/tags',timeout=2) as r:ready=any(x['name']==modello_attivo() for x in json.load(r)['models'])
  except Exception:pass
  return 200,{'mode':'local','model_ready':ready,'email_configured':bool(mail.config())}
 if path=='/api/password-request' and h.command=='POST':
  limit(('reset',ip),5,900)
  email=text(b,'email')
  reset=store.create_reset(email)
  if reset:
   user,value=reset
   if mail.config():
    mail.enqueue(user['company_id'],'reset:'+store.digest(value),user['email'],'Reimposta la password — Linea AI','Apri sul Mac questa pagina entro 30 minuti: http://127.0.0.1:8765/recupera-password.html#'+value+'\nSe non hai richiesto il cambio, ignora il messaggio.')
   else:
    from .reset_mail import save_local
    save_local(user,value)
  return 200,{'message':'Se l’account esiste, riceverai un collegamento per scegliere una nuova password.' if mail.config() else 'Se l’account esiste, il messaggio di recupero è disponibile al gestore nella cartella privata local-mail sul Mac. Nessuna email è stata spedita.'}
 if path=='/api/password-reset' and h.command=='POST':
  limit(('reset-complete',ip),10,900)
  store.reset_password(text(b,'token',100),text(b,'password',256));set_cookie(h,'',True)
  return 200,{'message':'Password aggiornata. Accedi con la nuova password.'}
 if path in ('/api/register','/api/login') and h.command=='POST':
  limit(('auth',ip),15,900)
  email=text(b,'email');password=text(b,'password',256)
  if path=='/api/register':
   if b.get('terms') is not True or b.get('privacy') is not True:raise ValueError('Accetta i termini e conferma di aver letto l’informativa privacy.')
   if b.get('password_confirm')!=password:raise ValueError('Le password non coincidono.')
   value=store.register(email,password,text(b,'company',120),consents=b)
  else:value=store.login(email,password,b.get('remember') is True)
  set_cookie(h,value,remember=path=='/api/login' and b.get('remember') is True);return 200,{'ok':True,'redirect':'/#contatti'}
 if path=='/api/accept-invite' and h.command=='POST':
  limit(('invite',ip),10,900)
  if b.get('accept') is not True:raise ValueError('Leggi e accetta le condizioni dell’anteprima.')
  value=companies.accept_invite(text(b,'token',100),text(b,'password',256));set_cookie(h,value)
  return 200,{'redirect':'/dashboard.html'}
 if path=='/api/installation-session' and h.command=='POST':
  limit(('sessions',ip),40)
  access,cfg=companies.start_installation(text(b,'installation',100),text(b,'ticket',100))
  return 201,{'session':access,'greeting':engine.greeting(cfg),'name':cfg['name']}
 if path in ('/api/company-overview','/api/company-review'):
  u=store.principal(cookie(h));cid=u['company_id']
  if path!='/api/me':subscriptions.require_access(u)
  if path=='/api/company-overview' and h.command=='GET':return 200,companies.overview(cid)
  if path=='/api/company-review' and h.command=='POST':
   companies.review(cid,text(b,'conversation',100),text(b,'comment',2000));return 200,{'saved':True}
  return 405,{'error':'Operazione non disponibile.'}
 if path=='/api/logout' and h.command=='POST':store.logout(cookie(h));set_cookie(h,'',True);return 200,{'ok':True}
 if path in ('/api/me','/api/config','/api/leads','/api/conversations','/api/email-status','/api/data-export','/api/data-export.xlsx','/api/data-delete') or path.startswith('/api/leads/') or path.startswith('/api/conversations/'):
  u=store.principal(cookie(h));cid=u['company_id']
  if path!='/api/me':subscriptions.require_access(u)
  if path=='/api/data-export.xlsx' and h.command=='GET':
   from .excel_export import workbook
   return 200,workbook(store.export_company(cid))
  if path=='/api/data-export' and h.command=='GET':return 200,store.export_company(cid)
  if path=='/api/data-delete' and h.command=='POST':
   if b.get('confirm') is not True:raise ValueError('Conferma la cancellazione.')
   store.delete_conversation(cid,text(b,'conversation',100));return 200,{'ok':True}
  if path=='/api/me' and h.command=='GET':return 200,dict(email=u['email'],company=store.company(cid))
  if path=='/api/config' and h.command=='POST':return 200,{'config':store.save_config(cid,b)}
  if path=='/api/leads' and h.command=='GET':return 200,{'leads':store.list_leads(cid)}
  if path=='/api/conversations' and h.command=='GET':return 200,{'conversations':store.list_conversations(cid)}
  if path=='/api/email-status' and h.command=='GET':return 200,mail.status(cid)
  if path.startswith('/api/leads/'):
   lid=path[len('/api/leads/'):]
   if h.command=='POST':store.set_status(cid,lid,text(b,'status',40));return 200,{'ok':True}
   if h.command=='GET':return 200,store.lead_detail(cid,lid)
  if path.startswith('/api/conversations/') and h.command=='GET':return 200,{'messages':store.conversation_detail(cid,path[len('/api/conversations/'):])}
  return 405,{'error':'Operazione non disponibile.'}
 if path=='/api/public' and h.command=='POST':
  public=text(b,'company',100,False) or 'demo'
  authorize_preview(h,public)
  with store.connection() as d:r=d.execute('SELECT config FROM companies WHERE public_id=?',(public,)).fetchone()
  if not r:raise store.Missing()
  cfg=json.loads(r['config']);return 200,{'name':cfg['name'],'greeting':engine.greeting(cfg)}
 if path=='/api/session' and h.command=='POST':
  limit(('sessions',ip),40)
  public=text(b,'company',100,False) or 'demo'
  authorize_preview(h,public)
  access,cfg=store.start_chat(public)
  return 201,{'session':access,'greeting':engine.greeting(cfg),'name':cfg['name']}
 if path in ('/api/chat','/api/feedback') and h.command=='POST':
  access=text(b,'session',100);row,state,cfg=store.conversation(access)
  if path=='/api/feedback':
   rating=b.get('rating');comment=text(b,'comment',1000,False)
   if type(rating)!=int or not 1<=rating<=5:raise ValueError('Scegli una valutazione da 1 a 5.')
   with store.connection() as d:d.execute('INSERT OR IGNORE INTO feedback VALUES (?,?,?,?)',(row['company_id'],row['id'],rating,comment))
   return 201,{'saved':True}
  if not MODEL_LOCK.acquire(False):return 429,{'error':'L’assistente è occupato. Riprova tra poco.'}
  try:
   # Rilegge lo stato dopo il lock: una richiesta parallela non usa una vecchia versione.
   row,state,cfg=store.conversation(access)
   if state['count']>=80:raise Limited()
   message=text(b,'message',2000)
   if state['closed']:return 200,{'reply':'La conversazione è conclusa. Puoi iniziarne una nuova quando vuoi.','saved':state['saved'],'closed':True,'consent_pending':False}
   reply,state=engine.respond(row,state,cfg,message)
   return 200,{'reply':reply,'saved':state['saved'],'closed':state['closed'],'consent_pending':state['pending']}
  finally:MODEL_LOCK.release()
 if path=='/api/trial' and h.command=='POST':
  limit(('trial',ip),10)
  data={k:text(b,k,n) for k,n in [('name',100),('company',150),('email',200),('message',1500)]}
  if b.get('consent') is not True or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',data['email']):raise ValueError('Controlla email e consenso.')
  identifier=text(b,'request_id',80)
  with store.connection() as d:
   old=d.execute('SELECT data FROM trials WHERE id=?',(identifier,)).fetchone()
   if old and json.loads(old['data'])!=data:raise ValueError('Richiesta già utilizzata. Ricarica la pagina.')
   d.execute('INSERT OR IGNORE INTO trials VALUES (?,?,?)',(identifier,store.now(),json.dumps(data)))
  status=mail.enqueue('demo','trial:'+identifier,data['email'],'Richiesta di prova Linea AI','Grazie '+data['name']+'. La tua richiesta di prova per '+data['company']+' è stata registrata. Il messaggio non conferma una data di appuntamento.')
  return 201,{'saved':True,'email_status':status}
 return 404,{'error':'Operazione non disponibile.'}

def authorize_preview(h,public):
 if public=='demo':return
 u=store.principal(cookie(h))
 if store.company(u['company_id'])['public_id']!=public:raise store.Missing()
 subscriptions.require_access(u)
