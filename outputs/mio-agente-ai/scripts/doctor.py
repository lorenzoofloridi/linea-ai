"""Local preflight: no credentials printed, no database migrations applied."""
import os,sys,json,sqlite3,socket,shutil,tempfile,importlib.metadata
from pathlib import Path
from urllib.request import urlopen,Request
import runtime_config as c

def main():
 errors=[]
 def report(name,ok,detail):
  print(('OK' if ok else 'ERRORE')+' | '+name+' | '+detail)
  if not ok:errors.append(name)
 report('Python',sys.version_info[:2]==(3,14),'richiesto Python 3.14; attuale '+sys.version.split()[0])
 for name,version in [('phonenumbers','9.0.39'),('tzdata','2026.4')]:
  try:actual=importlib.metadata.version(name);report(name,actual==version,actual+'; richiesto '+version)
  except importlib.metadata.PackageNotFoundError:report(name,False,'esegui linea.py install')
 report('Configurazione',True,'host e URL locali validati; valori riservati non mostrati')
 for name,path in [('dati',c.DATA),('segreti',c.SECRETS),('log',c.LOGS),('cache',c.CACHE),('temporanei',c.TEMP),('backup',c.BACKUPS)]:
  try:
   path.mkdir(parents=True,exist_ok=True,mode=0o700)
   with tempfile.TemporaryFile(dir=path) as f:f.write(b'check')
   restricted=os.name=='nt' or (path.stat().st_mode & 0o077)==0
   report('Directory '+name,restricted,'scrivibile'+('; verificare ACL dell’account su Windows' if os.name=='nt' else '; permessi privati' if restricted else '; limitare accesso alla directory'))
  except OSError:report('Directory '+name,False,'non creabile/scrivibile; controlla percorso e permessi')
 try:report('Disco',shutil.disk_usage(c.ROOT).free>=1024**3,'richiesto almeno 1 GiB libero per operazioni applicative; modelli possono richiedere molto di più')
 except OSError:report('Disco',False,'spazio non leggibile')
 sys.path.insert(0,str(c.ROOT/'outputs/linea-ai-site'))
 try:
  from saas import store
  original=store.DB
  with tempfile.TemporaryDirectory() as t:
   store.DB=Path(t)/'schema.sqlite3'
   try:
    store.init()
    with store.connection() as expected:
     expected_tables={row[0]:{v[1] for v in expected.execute('PRAGMA table_info("'+row[0]+'")')} for row in expected.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
   finally:store.DB=original
  if c.DATABASE.exists():
   with sqlite3.connect(c.DATABASE.as_uri()+'?mode=ro',uri=True) as d:
    report('Database',d.execute('PRAGMA quick_check').fetchone()[0]=='ok','controllo integrità in sola lettura')
    missing=[name for name,cols in expected_tables.items() if not cols.issubset({x[1] for x in d.execute('PRAGMA table_info("'+name+'")')})]
    report('Schema/migrazioni',not missing,'schema coerente' if not missing else 'schema additivo da aggiornare con avvio, dopo backup: '+', '.join(missing))
  else:report('Database',True,'nuova installazione: verrà creato al primo avvio; schema temporaneo verificato')
  print('NOTA | Migrazioni versionate non ancora presenti; controllo confronto tabelle/colonne, non certificazione di ogni vincolo.')
 except Exception as e:report('Database/schema',False,'controllo fallito: '+type(e).__name__)
 sock=socket.socket()
 try:sock.bind((c.HOST,c.PORT));report('Porta sito',True,'libera')
 except OSError:
  try:
   with urlopen(c.BASE_URL+'/api/health',timeout=3) as r:data=json.load(r)
   report('Porta sito',True,'occupata da un servizio HTTP compatibile; non avviare una seconda istanza')
  except Exception:report('Porta sito',False,'occupata o non utilizzabile; chiudi il processo o cambia LINEA_PORT')
 finally:sock.close()
 try:
  with urlopen(c.OLLAMA_URL+'/api/tags',timeout=4) as r:data=json.load(r)
  report('Ollama',True,'servizio raggiungibile')
  model=c.model_settings()['model'];names={x['name'] for x in data.get('models',[])}
  found=model in names or model+':latest' in names
  report('Modello',found,'modello configurato presente' if found else 'modello assente: installalo con ollama pull usando LINEA_MODEL')
  if found:
   with urlopen(Request(c.OLLAMA_URL+'/api/show',data=json.dumps({'model':model}).encode(),headers={'Content-Type':'application/json'}),timeout=10) as r:json.load(r)
   report('Accesso modello',True,'metadati leggibili; nessuna inferenza eseguita')
 except Exception as e:report('Ollama/modello',False,'servizio o modello non disponibile: '+type(e).__name__+'; avvia Ollama e verifica configurazione')
 print('Email, pagamenti, CRM e canali esterni richiedono configurazioni separate; non vengono inviati messaggi o pagamenti.')
 return 1 if errors else 0
if __name__=='__main__':
 try:raise SystemExit(main())
 except (ValueError,OSError):print('ERRORE | Configurazione o filesystem non valido. Controlla .env e i permessi.');raise SystemExit(1)
