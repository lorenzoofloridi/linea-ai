"""Crea una consegna sorgenti con elenco consentito, senza archivi o credenziali."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path(__file__).resolve().parent
site=root/'outputs/linea-ai-site';bot=root/'outputs/mio-agente-ai'
files=[]
for folder,extensions in [(site/'dist',{'.html','.css','.js','.svg','.woff','.woff2','.png','.jpg'}),(site/'saas',{'.py'}),(site/'tests',{'.py'}),(bot,{'.py'})]:
 files.extend(p for p in folder.rglob('*') if p.is_file() and not p.is_symlink() and '.venv' not in p.parts and '__pycache__' not in p.parts and p.suffix in extensions)
for name in ['serve.py','server_api.py','cli.py','esporta_archivio.py','Avvia-sito.command','LEGGIMI.md']:files.append(site/name)
for name in ['llm_locale.py','tempistiche.py','requirements.txt','LEGGIMI.md','README.md','AGENTS.md','Avvia.command','Avvia-assistente-generale.command','Collega-Google-Sheets.command','prompt.txt','legacy/chatbot_demo.html','evals/conversazioni.json','evals/LEGGIMI.md','config/modello.json','config/azienda_demo.json']:files.append(bot/name)
files.append(site/'dist/translations.json')
files.append(root/'DA-COMPLETARE.txt')
files.extend((bot/'documentazione').glob('*.md'))
files.extend([root/'Apri il sito.command',root/'ACCESSO-AL-SITO.md',root/'README.md',root/'AGENTS.md',root/'prepara-consegna.py',root/'TRASFERIRE-SU-UN-ALTRO-PC.md'])
out=root/'Consegna-informatico-senza-dati.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as z:
 for p in sorted(set(files)):z.write(p,p.relative_to(root))
 z.writestr('INSTALLAZIONE.md','''# Consegna sorgenti — anteprima locale

Non contiene account, chat, database, credenziali Google, chiavi SMTP o modelli. È una copia sorgenti da installare, non un’app pronta da aprire senza preparazione.

Con Python compatibile con requirements.txt (verificato su 3.14) e Ollama installati, dalla radice:

    python3 -m venv outputs/mio-agente-ai/.venv
    outputs/mio-agente-ai/.venv/bin/python -m pip install -r outputs/mio-agente-ai/requirements.txt
    ollama pull qwen2.5:7b
    cd outputs/linea-ai-site
    ../mio-agente-ai/.venv/bin/python serve.py

Aprire http://127.0.0.1:8765/ e registrare un account di prova. Per Mac rendere eseguibili i file .command se il programma di estrazione non conserva i permessi. Consultare outputs/mio-agente-ai/README.md e la relativa cartella documentazione. Le configurazioni Google e gli archivi storici sono esclusi; i relativi avvii richiedono una configurazione separata. Non pubblicare questa anteprima senza completare i punti di produzione indicati.
''')
 with_names=z.namelist()
 assert not any('/private-data/' in n or n.endswith(('credentials.json','token.json','.sqlite3','.log')) or '/.venv/' in n for n in with_names)
print(f'Consegna creata: {out.name} ({len(files)} file sorgenti/documenti). Nessun archivio o credenziale incluso.')
