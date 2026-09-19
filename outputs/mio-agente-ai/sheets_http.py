"""Google Sheets via HTTPS: OAuth esistente, timeout, nessun retry di scrittura."""
import json, os, ssl, tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen

class SheetsHTTP:
    def __init__(self,base): self.base=Path(base)
    def request(self,url,data=None,token=None,form=False,method=None):
        headers={}
        if token: headers['Authorization']='Bearer '+token
        if data is not None:
            headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
            data=(urlencode(data) if form else json.dumps(data)).encode()
        context=ssl.create_default_context()
        if Path('/etc/ssl/cert.pem').exists(): context.load_verify_locations('/etc/ssl/cert.pem')
        with urlopen(Request(url,data=data,headers=headers,method=method),timeout=12,context=context) as response:
            return json.load(response)
    def token(self):
        path=self.base/'token.json'
        d=json.loads(path.read_text())
        expiry=datetime.fromisoformat(d.get('expiry','1970-01-01T00:00:00Z').replace('Z','+00:00'))
        if expiry.tzinfo is None: expiry=expiry.replace(tzinfo=timezone.utc)
        if not d.get('token') or expiry<=datetime.now(timezone.utc)+timedelta(seconds=60):
            response=self.request('https://oauth2.googleapis.com/token',{
                'client_id':d['client_id'],'client_secret':d['client_secret'],
                'refresh_token':d['refresh_token'],'grant_type':'refresh_token'},form=True)
            d['token']=response['access_token']
            d['expiry']=(datetime.now(timezone.utc)+timedelta(seconds=int(response['expires_in']))).isoformat().replace('+00:00','Z')
            if response.get('refresh_token'): d['refresh_token']=response['refresh_token']
            fd,name=tempfile.mkstemp(dir=self.base,prefix='.oauth-',suffix='.tmp')
            try:
                with os.fdopen(fd,'w') as f: json.dump(d,f)
                os.replace(name,path)
            finally:
                if os.path.exists(name): os.unlink(name)
        return d['token']
    def values(self,config,range_,token,rows=None):
        url='https://sheets.googleapis.com/v4/spreadsheets/'+quote(config['spreadsheet_id'],safe='')+'/values/'+quote(range_,safe='')
        if rows is None: return self.request(url,token=token)
        url+=':append?'+urlencode({'valueInputOption':'RAW','insertDataOption':'INSERT_ROWS','includeValuesInResponse':'true'})
        return self.request(url,{'values':rows},token=token)
