"""Verifica HTTP locale isolata; nessuna email, Google o inferenza reale."""
import json,sys,tempfile,threading,types
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from unittest.mock import patch
BASE=Path(__file__).resolve().parents[1];sys.path.insert(0,str(BASE.parent/'linea-ai-site'))
from saas import api,engine,store,companies
from serve import Handler,ThreadingHTTPServer

def main():
 original=store.DB
 with tempfile.TemporaryDirectory() as tmp:
  store.DB=Path(tmp)/'check.sqlite3';store.init()
  with patch.dict(sys.modules,{'server_api':types.SimpleNamespace(handle=api.handle)}):
   server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();origin='http://127.0.0.1:'+str(server.server_port)
   def req(path,data=None,cookie=''):
    headers={'Origin':origin,'Content-Type':'application/json','Cookie':cookie}
    try:
     with urlopen(Request(origin+path,data=json.dumps(data).encode() if data is not None else None,headers=headers),timeout=10) as r:
      raw=r.read();return r.status,json.loads(raw) if r.headers.get_content_type()=='application/json' else raw.decode(),r.headers.get('Set-Cookie','').split(';')[0]
    except HTTPError as e:return e.code,{},''
   try:
    assert req('/')[0]==200
    assert 'Accedi al tuo account' in req('/dashboard.html')[1]
    accounts=[]
    for n in ('a','b'):
     status,data,cookie=req('/api/register',{'email':n+'@example.invalid','password':'HTTP-check-only-123','company':'Prova '+n,'terms':True,'privacy':True,'password_confirm':'HTTP-check-only-123'});assert status==200
     req('/api/logout',{},cookie)
     status,data,cookie=req('/api/login',{'email':n+'@example.invalid','password':'HTTP-check-only-123'});assert status==200
     me=req('/api/me',cookie=cookie)[1];accounts.append((cookie,me['company']))
     assert req('/api/plan-demo',{},cookie)[0]==200
    a,company=accounts[0];b,_=accounts[1]
    assert 'Richieste da gestire' in req('/dashboard.html',cookie=a)[1]
    cfg=company['config'];cfg['fields'].append(store.field('budget','Budget'))
    assert req('/api/config',cfg,a)[0]==200
    assert any(f['key']=='budget' for f in req('/api/me',cookie=a)[1]['company']['config']['fields'])
    assert req('/api/session',{'company':company['public_id']})[0]==401
    companies.verify(company['id'])
    installation=companies.installation(company['id'],'http://127.0.0.1:9000')
    with urlopen(origin+'/widget.html?installation='+installation) as response:
     assert "frame-ancestors http://127.0.0.1:9000;" in response.headers['Content-Security-Policy']
    ticket=companies.issue_ticket(installation)
    access=req('/api/installation-session',{'installation':installation,'ticket':ticket})[1]['session']
    assert req('/api/installation-session',{'installation':installation,'ticket':ticket})[0]==404
    result={'updates':[dict(key=k,value=v,quote=v) for k,v in {'nome':'Cliente Prova','telefono':'+44 20 8366 1177','interesse':'Consulenza','tempistica':'domani','budget':'1000 euro'}.items()],'action':'consent','consent':'none'}
    with patch.object(engine,'interpret',return_value=result):
     # respond's default is bound at definition time; call through a wrapper with explicit parser.
     real=engine.respond
     with patch.object(engine,'respond',side_effect=lambda row,state,cfg,msg:real(row,state,cfg,msg,lambda *args:result)):
      r=req('/api/chat',{'session':access,'message':'Cliente Prova +44 20 8366 1177 Consulenza domani 1000 euro'})[1];assert r['consent_pending']
      result={'updates':[],'consent':'positive','consent_quote':'sì','action':'continue'}
      assert req('/api/chat',{'session':access,'message':'sì'})[1]['saved']
    leads=req('/api/leads',cookie=a)[1]['leads'];assert len(leads)==1
    assert req('/api/leads',cookie=b)[1]['leads']==[]
    assert req('/api/leads/'+leads[0]['id'],cookie=b)[0]==404
    detail=req('/api/leads/'+leads[0]['id'],cookie=a)[1];assert detail['messages'] and detail['data']['budget']=='1000 euro'
    assert req('/api/leads/'+leads[0]['id'],{'status':'In lavorazione'},a)[0]==200
    assert req('/api/leads/'+leads[0]['id'],cookie=a)[1]['status']=='In lavorazione'
    print('HTTP OK: avvio, registrazione, login, dashboard, campi personalizzati, chat simulata, lead e isolamento tra aziende. Archivio temporaneo eliminato alla chiusura.')
   finally:server.shutdown();server.server_close();thread.join();store.DB=original
if __name__=='__main__':main()
