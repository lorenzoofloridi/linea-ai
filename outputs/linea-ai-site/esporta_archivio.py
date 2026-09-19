"""Esportazione locale del gestore: nuovi moduli e feedback, più archivi storici."""
import csv,sqlite3,json,os
from pathlib import Path
BASE=Path(__file__).resolve().parent
os.umask(0o077)
def write(name,headers,rows):
 p=BASE/'private-data'/name
 with p.open('w',newline='',encoding='utf-8-sig') as f:
  w=csv.writer(f);w.writerow(headers)
  w.writerows([["'"+v if isinstance(v,str) and v.lstrip().startswith(('=','+','-','@')) else v for v in row] for row in rows])
 p.chmod(0o600)
source=BASE/'private-data/platform.sqlite3'
if source.exists():
 with sqlite3.connect(source) as d:
  rows=[]
  for stamp,raw in d.execute('SELECT created_at,data FROM trials ORDER BY created_at'):
   data=json.loads(raw);rows.append([stamp,*[data.get(k,'') for k in ('name','company','email','message')]])
  write('richieste-prova.csv',['data','nome','azienda','email','messaggio'],rows)
  write('feedback-chat.csv',['azienda_id','conversazione_id','valutazione','commento'],d.execute('SELECT company_id,conversation_id,rating,comment FROM feedback').fetchall())
legacy=BASE/'private-data/website.sqlite3'
if legacy.exists():
 with sqlite3.connect(legacy) as d:
  for table,columns in [('trials','created_at,name,company,email,message,consent'),('feedback','created_at,rating,comment')]:
   write('storico-'+table+'.csv',columns.split(','),d.execute('SELECT '+columns+' FROM '+table+' ORDER BY created_at').fetchall())
print('Esportazioni private nella cartella private-data. Non inviate via email. I feedback includono più aziende: questi file sono riservati al gestore.')
