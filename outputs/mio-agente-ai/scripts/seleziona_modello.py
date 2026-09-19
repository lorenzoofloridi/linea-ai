"""Selezione esplicita; non scarica e non elimina modelli."""
import argparse,json,os,tempfile
from pathlib import Path
from urllib.request import urlopen
p=argparse.ArgumentParser();p.add_argument('modello',choices=['qwen2.5:7b','llama3','gpt-oss:20b']);args=p.parse_args()
with urlopen('http://127.0.0.1:11434/api/tags',timeout=5) as response:tags=json.load(response)['models']
names={x['name'] for x in tags}
if args.modello not in names and args.modello+':latest' not in names:raise SystemExit('Il modello deve prima essere installato in Ollama.')
path=Path(__file__).resolve().parents[1]/'config/modello.json';data=json.loads(path.read_text());data['model']=args.modello
fd,tmp=tempfile.mkstemp(dir=path.parent)
with os.fdopen(fd,'w') as f:json.dump(data,f,indent=2)
os.replace(tmp,path)
print('Modello selezionato:',args.modello)
