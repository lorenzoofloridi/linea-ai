"""Configuration shared by launchers, web server and local model. No secrets logged."""
import os,json
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[2]
BOT=Path(__file__).resolve().parent

def load_env():
 path=Path(os.environ.get('LINEA_ENV_FILE',ROOT/'.env'))
 if not path.is_absolute():path=ROOT/path
 if not path.exists():return
 for line in path.read_text(encoding='utf-8-sig').splitlines():
  line=line.strip()
  if not line or line.startswith('#'):continue
  key,sep,value=line.partition('=')
  if not sep or not key.strip().replace('_','').isalnum():raise ValueError('Riga non valida nel file ambiente.')
  value=value.strip()
  if len(value)>1 and value[0]==value[-1] and value[0] in ('"',"'"):value=value[1:-1]
  os.environ.setdefault(key.strip(),value)
load_env()
ENV=os.environ.get('LINEA_ENV','development')
if ENV not in ('development','test','production'):raise ValueError('LINEA_ENV deve essere development, test o production.')
PROFILE=json.loads((BOT/'config/environments'/(ENV+'.json')).read_text(encoding='utf-8'))
WORKERS=PROFILE['workers'] and ENV!='test'
def require_local_runtime():
 if ENV=='production':raise ValueError('Profilo production predisposto ma avvio bloccato: deployment non autorizzato in questa fase.')
def path(key,default):
 p=Path(os.environ.get(key) or default).expanduser()
 return p.resolve() if p.is_absolute() else (ROOT/p).resolve()
def number(key,default):
 value=int(os.environ.get(key) or default)
 if not 1<=value<=65535:raise ValueError('Porta non valida: '+key)
 return value
DATA=path('LINEA_DATA_DIR',PROFILE['data_dir']);SECRETS=path('LINEA_SECRETS_DIR',PROFILE['secrets_dir']);LOGS=path('LINEA_LOG_DIR','var/logs');CACHE=path('LINEA_CACHE_DIR','var/cache');TEMP=path('LINEA_TEMP_DIR','var/tmp');BACKUPS=path('LINEA_BACKUP_DIR','var/backups')
legacy_db=ROOT/'outputs/linea-ai-site/private-data/platform.sqlite3'
DATABASE=path('LINEA_DATABASE',DATA/'platform.sqlite3' if (DATA/'platform.sqlite3').exists() or not legacy_db.exists() or ENV!='development' else legacy_db)
HOST=os.environ.get('LINEA_HOST',PROFILE['host']);PORT=number('LINEA_PORT',PROFILE['port'])
if HOST not in ('127.0.0.1','localhost'):raise ValueError('Questa versione consente soltanto un host locale.')
BASE_URL=(os.environ.get('LINEA_BASE_URL') or f'http://{HOST}:{PORT}').rstrip('/')
u=urlsplit(BASE_URL)
if u.scheme!='http' or u.hostname not in ('127.0.0.1','localhost') or u.username or u.password or u.path or u.query or u.fragment:raise ValueError('LINEA_BASE_URL deve essere un URL HTTP locale senza percorso.')
OLLAMA_URL=os.environ.get('LINEA_OLLAMA_URL','http://127.0.0.1:11434').rstrip('/')
u=urlsplit(OLLAMA_URL)
if u.scheme not in ('http','https') or u.hostname not in ('127.0.0.1','localhost','::1') or u.username or u.password:raise ValueError('Ollama deve essere locale e senza credenziali nell’URL.')
MODEL_CONFIG=path('LINEA_MODEL_CONFIG',BOT/'config/modello.json')
def model_settings():
 data=json.loads(MODEL_CONFIG.read_text(encoding='utf-8')) if MODEL_CONFIG.exists() else {}
 if os.environ.get('LINEA_MODEL'):data['model']=os.environ['LINEA_MODEL']
 data.setdefault('model','qwen2.5:7b');data.setdefault('provider','ollama');return data
def secret_file(name):
 legacy=BOT/name
 return SECRETS/name if ENV!='development' or (SECRETS/name).exists() or not legacy.exists() else legacy
SMTP_FILE=path('LINEA_SMTP_FILE',SECRETS/'email.json' if ENV!='development' or (SECRETS/'email.json').exists() else ROOT/'outputs/linea-ai-site/private-data/email.json')
def smtp():
 if ENV=='test':return None
 if os.environ.get('LINEA_SMTP_HOST'):
  return dict(host=os.environ['LINEA_SMTP_HOST'],port=number('LINEA_SMTP_PORT',587),username=os.environ.get('LINEA_SMTP_USER',''),password=os.environ.get('LINEA_SMTP_PASSWORD',''),sender=os.environ.get('LINEA_SMTP_SENDER',''))
 return None

PUBLIC=ROOT/'outputs/linea-ai-site/dist'
for protected in (DATA,SECRETS,LOGS,CACHE,TEMP,BACKUPS,DATABASE,SMTP_FILE):
 if protected==PUBLIC or protected.is_relative_to(PUBLIC):raise ValueError('Dati privati e segreti non possono essere collocati in dist.')

if ENV=='test' and (DATA==ROOT/'var/data' or SECRETS==ROOT/'var/secrets' or DATABASE==legacy_db or DATABASE==ROOT/'var/data/platform.sqlite3'):
 raise ValueError('Il profilo test deve utilizzare directory e database separati dallo sviluppo.')
