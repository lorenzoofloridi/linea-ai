"""Strumento del gestore: eseguire localmente, mai esporre via HTTP."""
import argparse,json
from pathlib import Path
from . import store,companies,knowledge_sync,adapters

def main():
 p=argparse.ArgumentParser(description='Gestisci aziende, fonti, accessi e installazioni locali.')
 sub=p.add_subparsers(dest='command',required=True)
 sub.add_parser('list')
 a=sub.add_parser('create');a.add_argument('name')
 for cmd in ('verify','show'):
  a=sub.add_parser(cmd);a.add_argument('company')
 a=sub.add_parser('configure');a.add_argument('company');a.add_argument('file')
 a=sub.add_parser('invite');a.add_argument('company');a.add_argument('email')
 a=sub.add_parser('knowledge');a.add_argument('company');a.add_argument('kind',choices=['public','private','rule']);a.add_argument('file');a.add_argument('source')
 a=sub.add_parser('approve-knowledge');a.add_argument('company');a.add_argument('entry');a.add_argument('file');a.add_argument('--allow-ai',action='store_true')
 a=sub.add_parser('install');a.add_argument('company');a.add_argument('origin')
 for cmd in ('ticket','revoke'):
  a=sub.add_parser(cmd);a.add_argument('installation')
 a=sub.add_parser('sync-local');a.add_argument('company');a.add_argument('url');a.add_argument('html_file')
 a=sub.add_parser('channel');a.add_argument('company');a.add_argument('channel',choices=['whatsapp_mock','web'])
 args=p.parse_args();store.init();cmd=args.command
 if cmd=='sync-local':
  source=knowledge_sync.source(args.company,args.url);result=knowledge_sync.sync(args.company,source,knowledge_sync.LocalPageProvider({args.url:Path(args.html_file).read_text()}))
 elif cmd=='channel':
  identifier,secret=adapters.LocalChannels().bind(args.company,args.channel);result={'binding':identifier,'secret_for_server_only':secret}
 elif cmd=='list':
  with store.connection() as d:
   result=[dict(x) for x in d.execute("SELECT c.id,json_extract(c.config,'$.name') AS name,m.verified FROM companies c JOIN company_management m ON m.company_id=c.id")]
 elif cmd=='create':result={'company_id':companies.create(args.name)}
 elif cmd=='verify':companies.verify(args.company);result={'verified':True}
 elif cmd=='show':result=companies.overview(args.company)
 elif cmd=='configure':result=store.save_config(args.company,json.loads(Path(args.file).read_text()))
 elif cmd=='invite':result={'invitation_url':'http://127.0.0.1:8765/invito.html#'+companies.invite(args.company,args.email),'expires':'24 ore; monouso; non condividere con altri'}
 elif cmd=='knowledge':result={'entry':companies.add_knowledge(args.company,args.kind,Path(args.file).read_text(),args.source),'status':'Bozza: non utilizzata dall’AI'}
 elif cmd=='approve-knowledge':companies.review_knowledge(args.company,args.entry,Path(args.file).read_text(),args.allow_ai);result={'verified':True,'ai_allowed':args.allow_ai}
 elif cmd=='install':result={'installation':companies.installation(args.company,args.origin)}
 elif cmd=='ticket':result={'preview_url':'http://127.0.0.1:8765/widget.html?installation='+args.installation+'#'+companies.issue_ticket(args.installation),'expires':'120 secondi; monouso'}
 elif cmd=='revoke':companies.revoke(args.installation);result={'revoked':True}
 print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
