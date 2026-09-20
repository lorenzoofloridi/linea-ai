"""Crea due account fittizi autorizzati. Segreti solo in var/audit, mai nei log."""
import json, secrets, subprocess, tempfile, time, os
from pathlib import Path
base='https://ubiquitous-lily-7f46a5.netlify.app'
root=Path(__file__).resolve().parents[2]
accounts=[]
def call(path,body=None,cookie=''):
    with tempfile.NamedTemporaryFile(mode='w+',prefix='linea-audit-',delete=True) as f:
        args=['curl','-sS','--max-time','30','-D',f.name,'-w','\n%{http_code}',base+path]
        if cookie:args+=['-H','Cookie: '+cookie]
        if body is not None:args+=['-H','Content-Type: application/json','--data-binary','@-']
        r=subprocess.run(args,input=None if body is None else json.dumps(body),capture_output=True,text=True,check=True)
        payload,_,status=r.stdout.rpartition('\n');f.seek(0)
        cookies=[line.split(':',1)[1].strip().split(';')[0] for line in f if line.lower().startswith('set-cookie:')]
        return int(status),json.loads(payload),cookies[0] if cookies else ''
for label in ('A','B'):
    email=f'audit-{time.time_ns()}-{label.lower()}@example.invalid';password=secrets.token_urlsafe(24)
    status,data,cookie=call('/api/register',dict(email=email,password=password,password_confirm=password,company=f'Linea AI Test {label}',terms=True,privacy=True,marketing=False))
    assert status==200 and cookie, ('register',status)
    status,me,_=call('/api/me',cookie=cookie);assert status==200
    cid=me['company']['id'];assert me['email']==email
    assert call('/api/logout',{},cookie)[0]==200
    assert call('/api/me',cookie=cookie)[0]==401
    status,_,cookie=call('/api/login',{'email':email,'password':password});assert status==200 and cookie
    assert call('/api/me',cookie=cookie)[1]['company']['id']==cid
    accounts.append(dict(label=label,email=email,password=password,company_id=cid,cookie=cookie))
    print(f'PASS azienda {label}: registrazione, sessione, logout, login')
assert accounts[0]['company_id']!=accounts[1]['company_id']
for current,other in [(accounts[0],accounts[1]),(accounts[1],accounts[0])]:
    status,me,_=call('/api/me?company_id='+other['company_id'],cookie=current['cookie'])
    assert status==200 and me['company']['id']==current['company_id']
print('PASS /api/me ignora company_id estraneo; isolamento lead/conversazioni ancora da testare')
path=root/'var/audit/netlify-test-accounts.json'
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,'w') as f:json.dump(accounts,f)
print('Account fittizi conservati privatamente per le prove successive; nessuna email inviata dal test.')
