"""Controlli offline, senza credenziali o dati reali."""
import subprocess,sys
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
def main():
 commands=[['-B','-m','unittest','discover','-s',str(BASE/'tests')],['-B','-m','unittest','discover','-s',str(BASE.parent/'linea-ai-site/tests'),'-p','test_*.py'],['-m','pip','check']]
 for args in commands:
  result=subprocess.run([sys.executable,*args],cwd=BASE)
  if result.returncode:return result.returncode
 print('Controlli offline completati. Nessuna chiamata al modello, a Google o al servizio email.')
 return 0
if __name__=='__main__':raise SystemExit(main())
