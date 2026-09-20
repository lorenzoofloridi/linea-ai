"""Company review workflow. Administrative mutations are local-operator only."""
import argparse,getpass,json
from . import store
STATES=('pending','under_review','verified','rejected','suspended')
TRANSITIONS={'pending':{'under_review','verified','rejected','suspended'},'under_review':{'verified','rejected','pending','suspended'},'verified':{'under_review','suspended'},'rejected':{'under_review','pending','suspended'},'suspended':{'under_review','verified','rejected'}}
def init(d):
 d.executescript("""CREATE TABLE IF NOT EXISTS company_verification(company_id TEXT PRIMARY KEY REFERENCES companies(id),status TEXT NOT NULL CHECK(status IN ('pending','under_review','verified','rejected','suspended')),updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS company_verification_audit(id INTEGER PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),actor TEXT NOT NULL,previous TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);""")
 d.execute("INSERT OR IGNORE INTO company_verification SELECT c.id,CASE WHEN m.verified=1 OR p.status='verified' THEN 'verified' ELSE 'pending' END,? FROM companies c LEFT JOIN company_management m ON m.company_id=c.id LEFT JOIN plan_profiles p ON p.company_id=c.id",(store.now(),))
 # Keep the compatibility installation flag aligned with migrated approvals.
 d.execute("UPDATE company_management SET verified=1 WHERE company_id IN (SELECT company_id FROM company_verification WHERE status='verified')")
def status(cid,connection=None):
 if connection is not None:
  row=connection.execute('SELECT status FROM company_verification WHERE company_id=?',(cid,)).fetchone();return row[0] if row else 'pending'
 with store.connection() as d:return status(cid,d)
def allowed(cid):return status(cid) not in ('suspended','rejected')
def transition(d,cid,target,actor,reason):
 if target not in STATES or not actor.strip() or not reason.strip() or len(reason)>1000:raise ValueError('Indica stato, operatore e motivazione.')
 if not d.execute('SELECT 1 FROM companies WHERE id=?',(cid,)).fetchone():raise store.Missing()
 previous=status(cid,d)
 if previous==target:return
 if target not in TRANSITIONS[previous]:raise ValueError('Transizione aziendale non consentita.')
 d.execute('INSERT INTO company_verification VALUES (?,?,?) ON CONFLICT(company_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at',(cid,target,store.now()))
 d.execute('INSERT INTO company_verification_audit(company_id,actor,previous,status,reason,created_at) VALUES (?,?,?,?,?,?)',(cid,actor,previous,target,reason,store.now()))
 d.execute('INSERT INTO company_management(company_id,verified) VALUES (?,?) ON CONFLICT(company_id) DO UPDATE SET verified=excluded.verified',(cid,int(target=='verified')))
 # Preserve the historical commercial-profile constraint while exposing one workflow.
 legacy='verified' if target=='verified' else 'rejected' if target in ('rejected','suspended') else 'needs_review' if target=='under_review' else 'pending'
 d.execute('UPDATE plan_profiles SET status=?,updated_at=? WHERE company_id=?',(legacy,store.now(),cid))
def review(cid,target,reason):
 with store.connection() as d:
  d.execute('BEGIN IMMEDIATE');transition(d,cid,target,'local:'+getpass.getuser(),reason)
def history(cid):
 with store.connection() as d:return [dict(r) for r in d.execute('SELECT actor,previous,status,reason,created_at FROM company_verification_audit WHERE company_id=? ORDER BY id',(cid,))]
if __name__=='__main__':
 parser=argparse.ArgumentParser(description='Revisione amministrativa locale, senza registri esterni.')
 parser.add_argument('command',choices=['list','review','history']);parser.add_argument('company',nargs='?');parser.add_argument('--status',choices=STATES);parser.add_argument('--reason');args=parser.parse_args();store.init()
 if args.command=='review':
  if not args.company or not args.status or not args.reason:parser.error('Servono company, --status e --reason')
  review(args.company,args.status,args.reason);print('Revisione registrata.')
 elif args.command=='history':print(json.dumps(history(args.company),ensure_ascii=False,indent=2))
 else:
  with store.connection() as d:
   for row in d.execute('SELECT id,config FROM companies'):
    print(row['id'],json.loads(row['config'])['name'],status(row['id'],d))
