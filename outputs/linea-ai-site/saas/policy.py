"""Configurazione aggiuntiva compatibile e permessi controllati dal server."""
import copy,re
from . import store
CAPABILITIES=('can_collect_leads','can_request_phone','can_request_email','can_book_appointments','can_modify_appointments','can_cancel_appointments','can_handoff_to_human','can_use_whatsapp','can_use_voice','can_send_to_crm')
def defaults():
 return {'capabilities':{k:k in CAPABILITIES[:3] for k in CAPABILITIES},'branding':{'assistant_name':'','greeting':'','color':'#142c3c','logo':'','avatar':'','tone':'Professionale e cordiale','contact':'','widget_position':'right'},'goals':'','scoring':[],'departments':[],'crm_auto':False,'booking_provider':'mock','crm_provider':'mock','voice_provider':'mock'}
def validate(raw):
 if not isinstance(raw,dict):raise ValueError('Impostazioni agente non valide.')
 out=defaults();caps=raw.get('capabilities',{})
 if not isinstance(caps,dict) or set(caps)-set(CAPABILITIES) or any(type(v)!=bool for v in caps.values()):raise ValueError('Permessi non validi.')
 out['capabilities'].update(caps)
 brand=raw.get('branding',{})
 if not isinstance(brand,dict) or set(brand)-set(out['branding']):raise ValueError('Branding non valido.')
 for k,v in brand.items():
  if not isinstance(v,str) or len(v)>600:raise ValueError('Branding troppo lungo.')
  if k=='color' and not re.fullmatch(r'#[a-fA-F0-9]{6}',v):raise ValueError('Colore non valido.')
  if k in ('logo','avatar') and v and not re.fullmatch(r'/assets/[a-zA-Z0-9_/-]+\.(?:png|jpg|webp|svg)',v):raise ValueError('Usa un file locale in /assets/.')
  if k=='widget_position' and v not in ('left','right'):raise ValueError('Posizione non valida.')
  out['branding'][k]=v
 if not isinstance(raw.get('goals',''),str) or len(raw.get('goals',''))>2000:raise ValueError('Obiettivi non validi.')
 out['goals']=raw.get('goals','')
 for key in ('scoring','departments'):
  rules=raw.get(key,[])
  if not isinstance(rules,list) or len(rules)>20:raise ValueError('Troppe regole.')
  for rule in rules:
   if not isinstance(rule,dict):raise ValueError('Regola non valida.')
   allowed={'field','op','value','points','label'} if key=='scoring' else {'field','op','value','name','recipient','site'}
   if set(rule)-allowed or rule.get('op') not in ('contains','equals','present','gte'):raise ValueError('Operatore non valido.')
   if not isinstance(rule.get('field'),str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,39}',rule['field']):raise ValueError('Campo non valido.')
   for k,v in rule.items():
    if k=='points':
     if type(v)!=int or not 0<=v<=100:raise ValueError('Punti da 0 a 100.')
    elif not isinstance(v,str) or len(v)>200:raise ValueError('Valore regola non valido.')
   if key=='scoring' and ('points' not in rule or not rule.get('label')):raise ValueError('Indica punti e spiegazione.')
   if key=='departments' and not rule.get('name'):raise ValueError('Indica il reparto.')
  out[key]=copy.deepcopy(rules)
 if type(raw.get('crm_auto',False))!=bool:raise ValueError('Invio automatico non valido.')
 out['crm_auto']=raw.get('crm_auto',False)
 for key in ('booking_provider','crm_provider','voice_provider'):
  if raw.get(key,'mock')!='mock':raise ValueError('In questa fase è disponibile soltanto il provider mock locale.')
 return out

def settings(cfg):return validate(cfg.get('agent',{}))
def effective(cid,cfg):
 live=settings(store.company(cid)['config'])['capabilities'];snapshot=settings(cfg)['capabilities']
 from .subscriptions import entitlements
 from .plan_entitlements import CAPABILITY_FEATURE
 features={k:True for k in CAPABILITY_FEATURE.values()} if cid=='demo' else entitlements(cid)
 return {k:live[k] and snapshot[k] and features.get(CAPABILITY_FEATURE[k],False) for k in CAPABILITIES}
def require(cid,cfg,cap):
 if not effective(cid,cfg).get(cap,False):raise ValueError('Azione non autorizzata per questa azienda.')
def filtered(cid,cfg):
 out=copy.deepcopy(cfg);caps=effective(cid,cfg);out['agent']=settings(cfg);out['agent']['capabilities']=caps
 out['fields']=[f for f in out['fields'] if caps['can_collect_leads'] and (f['kind']!='phone' or caps['can_request_phone']) and (f['kind']!='email' or caps['can_request_email'])]
 return out
