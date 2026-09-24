"""Crea una consegna sorgenti con elenco consentito, senza archivi o credenziali."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parent
site=root/'outputs/linea-ai-site';bot=root/'outputs/mio-agente-ai'
files=[]
files.extend(root/name for name in ["package.json", "package-lock.json", "netlify.toml"])
files.extend(p for p in (root/"netlify").rglob("*") if p.is_file() and not p.is_symlink() and p.suffix in {".mjs", ".sql", ".md", ".py"})
for folder in ["database", "scripts"]:
    files.extend(p for p in (root/folder).rglob("*") if p.is_file() and not p.is_symlink() and p.suffix in {".mjs", ".sql", ".md"})
for folder,extensions in [(site/'dist',{'.html','.css','.js','.svg','.woff','.woff2','.png','.jpg'}),(site/'saas',{'.py'}),(site/'tests',{'.py'}),(bot,{'.py'})]:
 files.extend(p for p in folder.rglob('*') if p.is_file() and not p.is_symlink() and '.venv' not in p.parts and '__pycache__' not in p.parts and p.suffix in extensions)
for name in ['serve.py','server_api.py','cli.py','esporta_archivio.py','Avvia-sito.command','LEGGIMI.md']:files.append(site/name)
for name in ['llm_locale.py','tempistiche.py','requirements.txt','LEGGIMI.md','README.md','AGENTS.md','Avvia.command','Avvia-assistente-generale.command','Collega-Google-Sheets.command','prompt.txt','legacy/chatbot_demo.html','evals/conversazioni.json','evals/LEGGIMI.md','config/modello.json','config/azienda_demo.json']:files.append(bot/name)
files.append(site/'dist/translations.json')
files.append(root/'DA-COMPLETARE.txt')
files.extend(root/name for name in ['.env.example','.gitignore','backup-privato.py'])
files.extend(root/name for name in ['linea.py','verifica-snapshot.py','Installa-Windows.bat','Avvia-Windows.bat','installa.sh','avvia.sh'])
files.append(bot/'requirements-runtime.lock')
files.extend((bot/'config/environments').glob('*.json'))
files.extend((bot/'documentazione').glob('*.md'))
files.extend([root/'Apri il sito.command',root/'ACCESSO-AL-SITO.md',root/'README.md',root/'AGENTS.md',root/'prepara-consegna.py',root/'TRASFERIRE-SU-UN-ALTRO-PC.md'])
out=root/'Linea-AI-SOURCE.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as z:
 for p in sorted(set(files)):
  rel=p.relative_to(root)
  if any(x in rel.parts for x in ('.venv','private-data','var','logs','cache','backups','data','__pycache__')) or p.name in ('.env','credentials.json','token.json','email.json','google_sheets.json'):continue
  if str(rel)=='outputs/mio-agente-ai/config/modello.json':
   z.writestr(str(rel),'{"provider":"ollama","model":"qwen2.5:7b"}');continue
  z.write(p,rel)
 z.writestr('INSTALLAZIONE.md','''# Consegna sorgenti — anteprima locale

Non contiene account, chat, database, credenziali Google, chiavi SMTP o modelli. È una copia sorgenti da installare, non un’app pronta da aprire senza preparazione.

Con Python 3.14 e Ollama installati, dalla radice:

    python3 -X utf8 linea.py install
    ollama pull qwen2.5:7b
    python3 -X utf8 linea.py check
    python3 -X utf8 linea.py start

Su Windows usare py -3.14 al posto di python3, oppure Installa-Windows.bat e Avvia-Windows.bat. Non trasferire la .venv: ricrearla. L’installazione essenziale usa requirements-runtime.lock con hash. requirements.txt conserva le librerie dei percorsi storici opzionali.

Aprire http://127.0.0.1:8765/ e registrare un account di prova. Per Mac rendere eseguibili i file .command se il programma di estrazione non conserva i permessi. Consultare outputs/mio-agente-ai/README.md e la relativa cartella documentazione. Le configurazioni Google e gli archivi storici sono esclusi; i relativi avvii richiedono una configurazione separata. Non pubblicare questa anteprima senza completare i punti di produzione indicati.
''')
 with_names=z.namelist()
 assert not any('/private-data/' in n or n.endswith(('credentials.json','token.json','.sqlite3','.log')) or '/.venv/' in n for n in with_names)
print(f'Consegna creata: {out.name} ({len(files)} file sorgenti/documenti). Nessun archivio o credenziale incluso.')

# Compatibility name always contains the same SOURCE, never a private backup.
import shutil
shutil.copy2(out,root/'Consegna-informatico-senza-dati.zip')
