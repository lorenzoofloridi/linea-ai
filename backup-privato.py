"""Create a consistent private snapshot, separate from SOURCE distribution."""
import sys,os,json,hashlib,sqlite3,tempfile,zipfile
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'outputs/mio-agente-ai'))
import runtime_config as c

def main():
 os.umask(0o077);folder=c.BACKUPS/('PRIVATE-'+datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f'));folder.mkdir(parents=True,mode=0o700)
 excluded={'.venv','__pycache__','.git','backups','cache','node_modules'};manifest={};dbs=0
 sources={}
 for p in ROOT.rglob('*'):
  if not p.is_file() or p.is_symlink() or any(x in excluded for x in p.relative_to(ROOT).parts) or p.is_relative_to(c.BACKUPS) or p.suffix=='.zip' or p.name.endswith(('-wal','-shm')):continue
  sources['project/'+p.relative_to(ROOT).as_posix()]=p
 for label,path in [('data',c.DATA),('secrets',c.SECRETS)]:
  if path.exists() and not path.is_relative_to(ROOT):
   for p in path.rglob('*'):
    if p.is_file() and not p.is_symlink() and not p.name.endswith(('-wal','-shm')):sources['external/'+label+'/'+p.relative_to(path).as_posix()]=p
 for label,path in [('smtp',c.SMTP_FILE),('model',c.MODEL_CONFIG),('environment',c.path('LINEA_ENV_FILE',ROOT/'.env'))]:
  if path.exists() and not path.is_relative_to(ROOT):sources['external/config/'+label+path.suffix]=path
 if c.DATABASE.exists() and not c.DATABASE.is_relative_to(ROOT) and not c.DATABASE.is_relative_to(c.DATA):sources['external/database/platform.sqlite3']=c.DATABASE
 with tempfile.TemporaryDirectory() as tmp,zipfile.ZipFile(folder/'snapshot.zip','w',zipfile.ZIP_DEFLATED) as z:
  for name,path in sorted(sources.items()):
   if path.suffix in ('.sqlite3','.db'):
    src=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True);copy=Path(tmp)/str(dbs);out=sqlite3.connect(copy)
    try:src.backup(out);assert out.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    finally:src.close();out.close()
    data=copy.read_bytes();dbs+=1
   else:data=path.read_bytes()
   z.writestr(name,data);manifest[name]=hashlib.sha256(data).hexdigest()
 record={'files':manifest,'sqlite_checked':dbs,'archive_sha256':hashlib.sha256((folder/'snapshot.zip').read_bytes()).hexdigest()}
 (folder/'manifest.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
 with zipfile.ZipFile(folder/'snapshot.zip') as z:
  assert z.testzip() is None
  for name,digest in manifest.items():assert hashlib.sha256(z.read(name)).hexdigest()==digest
 for p in folder.iterdir():p.chmod(0o600)
 print('BACKUP PRIVATO verificato:',folder,'— contiene dati e segreti, non distribuire.')
if __name__=='__main__':main()
