"""Copy legacy persistent files into configured directories; never overwrite."""
import sqlite3,shutil,hashlib,os
from pathlib import Path
import runtime_config as c

def main():
 os.umask(0o077)
 for p in [c.DATA,c.SECRETS,c.LOGS]:p.mkdir(parents=True,exist_ok=True,mode=0o700)
 for source,target in [(c.legacy_db,c.DATA/'platform.sqlite3'),(c.BOT/'data/agente.db',c.DATA/'agente.db')]:
  if not source.exists() or source.resolve()==target.resolve():continue
  if target.exists():print('Archivio destinazione già presente: non sovrascritto.');continue
  src=sqlite3.connect(source.as_uri()+'?mode=ro',uri=True);dst=sqlite3.connect(target)
  try:src.backup(dst);assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
  finally:src.close();dst.close()
  target.chmod(0o600);print('Copia SQLite coerente creata:',target.name)
 for source in [c.BOT/'credentials.json',c.BOT/'token.json',c.BOT/'google_sheets.json',c.ROOT/'outputs/linea-ai-site/private-data/email.json']:
  target=c.SECRETS/source.name
  if not source.exists() or source.resolve()==target.resolve():continue
  if target.exists():print('Configurazione destinazione già presente: non sovrascritta.');continue
  shutil.copyfile(source,target);target.chmod(0o600)
  assert hashlib.sha256(source.read_bytes()).digest()==hashlib.sha256(target.read_bytes()).digest()
 print('Copie verificate. Originali conservati. Riavvia il server; controlla LINEA_DATABASE se impostato. Non usare contemporaneamente vecchie e nuove copie.')
 return 0
if __name__=='__main__':raise SystemExit(main())
