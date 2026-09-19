"""Local reset mailbox; private filesystem only, never an HTTP endpoint."""
import os
from . import store

def save_local(user,token):
 folder=store.DB.parent/'local-mail'
 folder.mkdir(mode=0o700,parents=True,exist_ok=True);folder.chmod(0o700)
 path=folder/('reset-'+store.digest(user['email'])[:24]+'.txt')
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as f:
  f.write('EMAIL DI PROVA LOCALE — non spedita\nDestinatario: '+user['email']+'\n\nCollegamento monouso, valido 30 minuti:\nhttp://127.0.0.1:8765/recupera-password.html#'+token+'\n')
 path.chmod(0o600)
