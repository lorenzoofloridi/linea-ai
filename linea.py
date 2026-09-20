"""Installazione, diagnostica e avvio locali portabili. Solo libreria standard."""
import argparse,json,os,platform,subprocess,sys,venv
from pathlib import Path
ROOT=Path(__file__).resolve().parent
BOT=ROOT/'outputs/mio-agente-ai'
SITE=ROOT/'outputs/linea-ai-site'

def interpreter(environment,system=None):
 return Path(environment)/('Scripts/python.exe' if (system or os.name)=='nt' else 'bin/python')
def environment_vars():
 return dict(os.environ,PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1')
def run(args,cwd=ROOT):
 return subprocess.run([str(x) for x in args],cwd=cwd,env=environment_vars()).returncode
def install(environment,wheels=None):
 if sys.version_info[:2]!=(3,14):raise ValueError('Per questa versione installa Python 3.14. Altre versioni non sono ancora verificate.')
 environment=Path(environment).resolve();python=interpreter(environment)
 marker=environment/'linea-platform.json'
 if environment.exists():
  if not python.exists():raise ValueError('Ambiente esistente non compatibile. Scegli una nuova cartella: non copiare la .venv da un altro sistema.')
  if marker.exists() and json.loads(marker.read_text(encoding='utf-8'))['system']!=platform.system():raise ValueError('Ambiente creato su un altro sistema. Crea una nuova .venv.')
 else:venv.EnvBuilder(with_pip=True).create(environment)
 args=[python,'-X','utf8','-m','pip','install','--require-hashes','--only-binary=:all:','-r',BOT/'requirements-runtime.lock']
 if wheels:args+=['--no-index','--find-links',Path(wheels).resolve()]
 result=run(args)
 if result:return result
 marker.write_text(json.dumps({'system':platform.system(),'python':platform.python_version()}),encoding='utf-8')
 print('Ambiente pronto. Ollama e il modello si installano separatamente.');return 0

def main(argv=None):
 p=argparse.ArgumentParser(description='Linea AI: installazione e avvio locali su Mac, Windows e Linux.')
 p.add_argument('command',choices=['install','check','doctor','backup','migrate-data','start','chat'])
 p.add_argument('--environment',type=Path,default=BOT/'.venv',help='Ambiente Python locale (non trasferire tra PC).')
 p.add_argument('--wheels',type=Path,help='Cartella di wheel per installazione offline.')
 a=p.parse_args(argv);python=interpreter(a.environment.resolve())
 if a.command=='install':return install(a.environment,a.wheels)
 if not python.exists():raise ValueError('Ambiente assente: esegui prima linea.py install.')
 if a.command=='migrate-data':return run([python,'-X','utf8','-B','-m','scripts.migrate_data'],BOT)
 if a.command=='doctor':return run([python,'-X','utf8','-B','-m','scripts.doctor'],BOT)
 if a.command=='backup':return run([python,'-X','utf8','-B',ROOT/'backup-privato.py'])
 if a.command=='check':
  for args,cwd in [(['-c',"import sys,sqlite3,hashlib; from zoneinfo import ZoneInfo; import phonenumbers; print('Python:',sys.version.split()[0]); print('SQLite:',sqlite3.sqlite_version); print('Fuso:',ZoneInfo('Europe/Rome')); assert hasattr(hashlib,'scrypt')"],ROOT),(['-m','scripts.verifica_progetto'],BOT),(['-m','scripts.verifica_http'],BOT)]:
   code=run([python,'-X','utf8','-B',*args],cwd)
   if code:return code
  return 0
 try:return run([python,'-X','utf8','-B',SITE/('serve.py' if a.command=='start' else 'cli.py')],SITE)
 except KeyboardInterrupt:return 0
if __name__=='__main__':
 try:raise SystemExit(main())
 except (ValueError,OSError) as e:print('Linea AI:',e,file=sys.stderr);raise SystemExit(1)
