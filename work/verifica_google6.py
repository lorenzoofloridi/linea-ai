import sys,time,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from sheets_http import SheetsHTTP
from sheets_store import BASE,GoogleSheets
start=time.monotonic();config=GoogleSheets().configuration();http=SheetsHTTP(BASE);token=http.token()
tab="'"+config['worksheet'].replace("'","''")+"'"
header=http.values(config,tab+'!A1:E1',token)
values=http.values(config,tab+'!A2:A',token).get('values',[])
print(json.dumps({'google_read_ok':True,'elapsed_seconds':round(time.monotonic()-start,2),'header_columns':len(header.get('values',[[]])[0]),'lorenzetta_matches':sum(1 for r in values if r and r[0].strip().casefold()=='lorenzetta')},ensure_ascii=False))
