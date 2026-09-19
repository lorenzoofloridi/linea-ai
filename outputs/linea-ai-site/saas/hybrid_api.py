"""API locale dell’agente ibrido; identità sempre da sessione o account verificato."""
import json
from . import store,policy,hybrid,adapters,engine,languages,knowledge_sync

def visitor_config(cfg):
 return {'branding':policy.settings(cfg)['branding'],'capabilities':policy.settings(cfg)['capabilities'],'voice_provider':'mock'}
def route(h,path,b):
 from .api import cookie,text
 if path in ('/api/agent-settings','/api/agent-activity','/api/human','/api/lead-stage','/api/local-slot','/api/source-revisions','/api/source-approve'):
  u=store.principal(cookie(h));cid=u['company_id']
  from .subscriptions import require_access
  require_access(u)
  if path=='/api/agent-settings':
   if h.command=='GET':return 200,policy.settings(store.company(cid)['config'])
   cfg=store.company(cid)['config'];cfg['agent']=policy.validate(b);store.save_config(cid,cfg)
   with store.connection() as d:hybrid.audit(d,cid,None,u['id'],'agent_settings','updated')
   return 200,{'saved':True}
  if path=='/api/agent-activity' and h.command=='GET':return 200,hybrid.company_data(cid)
  if path=='/api/source-revisions' and h.command=='GET':
   with store.connection() as d:rows=[dict(r) for r in d.execute('SELECT r.*,s.url FROM public_revisions r JOIN public_sources s ON s.id=r.source_id AND s.company_id=r.company_id WHERE r.company_id=? ORDER BY r.created_at DESC',(cid,))]
   return 200,{'revisions':rows}
  if h.command!='POST':return 405,{'error':'Operazione non disponibile.'}
  if path=='/api/source-approve':knowledge_sync.approve(cid,text(b,'revision',100));return 200,{'saved':True}
  if path=='/api/human':return 200,{'mode':hybrid.handoff(cid,text(b,'conversation',100),text(b,'mode',40),u['id'],text(b,'message',2000,False))}
  if path=='/api/lead-stage':hybrid.stage(cid,text(b,'lead',100),text(b,'stage',30),u['id']);return 200,{'saved':True}
  if path=='/api/local-slot':return 201,{'id':adapters.MockBooking().add_slot(cid,text(b,'starts',80),text(b,'label',120))}
 if path not in ('/api/agent-state','/api/booking-slots','/api/booking-confirm','/api/request-human','/api/voice-mock'):return 404,{'error':'Operazione non disponibile.'}
 if h.command!='POST':return 405,{'error':'Operazione non disponibile.'}
 access=text(b,'session',100);row,state,cfg=store.conversation(access);cid=row['company_id']
 if path=='/api/agent-state':
  data=visitor_config(policy.filtered(cid,cfg));data.update(mode=state.get('mode','AI_ACTIVE'),messages=store.conversation_detail(cid,row['id']))
  return 200,data
 if state.get('closed') or state.get('mode','AI_ACTIVE')!='AI_ACTIVE':raise ValueError('La conversazione non è attiva con l’AI.')
 if path=='/api/booking-slots':
  policy.require(cid,cfg,'can_book_appointments');return 200,{'slots':adapters.MockBooking().available(cid),'mock':True}
 if path=='/api/booking-confirm':return 201,{'booking':adapters.MockBooking().book(access,text(b,'slot',100),b.get('confirm')),'message':'Prenotazione di prova registrata. Nessun appuntamento reale.'}
 if path=='/api/request-human':
  if b.get('confirm') is not True:raise ValueError('Conferma che vuoi trasferire la conversazione al personale.')
  hybrid.handoff(cid,row['id'],'HANDOFF_REQUESTED','visitor');return 200,{'mode':'HANDOFF_REQUESTED','message':languages.render('La conversazione è in attesa del personale dell’azienda.',state.get('language','it'))}
 if path=='/api/voice-mock':
  policy.require(cid,cfg,'can_use_voice')
  if b.get('transcript_consent') is not True:raise ValueError('Serve il consenso a conservare la trascrizione nella conversazione.')
  message=adapters.MockVoice().transcribe(text(b,'transcript',2000));state['voice_consent']=True
  reply,state=engine.respond(row,state,cfg,message)
  with store.connection() as d:hybrid.audit(d,cid,row['id'],'visitor','voice_mock','transcript_saved')
  return 200,{'reply':reply,'saved':state['saved'],'closed':state['closed'],'speech':adapters.MockVoice().synthesize(reply)}
