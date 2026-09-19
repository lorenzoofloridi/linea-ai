"""Contratti per integrazioni. Nessuna chiamata di rete né credenziale nel browser."""
from typing import Protocol
import json,hmac
from datetime import datetime,timezone
from . import store,policy,hybrid
class BookingProvider(Protocol):
 def available(self,cid):...
 def book(self,access,slot,confirmed):...
class CRMProvider(Protocol):
 def send(self,d,cid,lid,payload):...
class VoiceProvider(Protocol):
 def transcribe(self,sample):...
 def synthesize(self,text):...
class MockVoice:
 def transcribe(self,sample):
  if not isinstance(sample,str) or not 1<=len(sample.strip())<=2000:raise ValueError('Trascrizione di prova non valida.')
  return sample.strip()
 def synthesize(self,text):return {'provider':'mock','text':text,'audio':None}
class MockCRM:
 def send(self,d,cid,lid,payload):
  if payload.get('company_id')!=cid or payload.get('lead_id')!=lid or not d.execute('SELECT 1 FROM leads WHERE company_id=? AND id=?',(cid,lid)).fetchone():raise store.Missing()
  d.execute('INSERT INTO crm_mock VALUES (?,?,?,?) ON CONFLICT(company_id,lead_id) DO UPDATE SET payload=excluded.payload',(cid,lid,json.dumps(payload),store.now()))
class UnconfiguredCRM:
 def __init__(self,name):
  if name not in ('hubspot','salesforce','pipedrive','webhook','zapier'):raise ValueError('Connettore sconosciuto.')
  self.name=name
 def send(self,*args):raise ValueError('Connettore esterno non configurato; nessun invio effettuato.')
class MockBooking:
 def add_slot(self,cid,starts,label):
  store.company(cid)
  value=datetime.fromisoformat(starts)
  if value.tzinfo is None or value<=datetime.now(timezone.utc):raise ValueError('Data futura con fuso orario richiesta.')
  if not isinstance(label,str) or not 1<=len(label)<=120:raise ValueError('Descrizione non valida.')
  slot=store.token()
  with store.connection() as d:d.execute('INSERT INTO booking_slots VALUES (?,?,?,?)',(slot,cid,value.astimezone(timezone.utc).isoformat(),label))
  return slot
 def available(self,cid):
  with store.connection() as d:
   return [dict(r) for r in d.execute('SELECT s.id,s.starts,s.label FROM booking_slots s WHERE s.company_id=? AND s.starts>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.company_id=s.company_id AND b.slot_id=s.id) ORDER BY starts LIMIT 30',(cid,store.now()))]
 def book(self,access,slot,confirmed):
  row,state,cfg=store.conversation(access);cid=row['company_id'];sid=row['id']
  try:
   policy.require(cid,cfg,'can_book_appointments')
   if confirmed is not True:raise ValueError('Conferma esplicitamente l’appuntamento selezionato.')
   if not state.get('saved'):raise ValueError('Completa prima la richiesta con consenso al contatto.')
   with store.connection() as d:
    d.execute('BEGIN IMMEDIATE')
    live=json.loads(d.execute('SELECT config FROM companies WHERE id=?',(cid,)).fetchone()[0])
    if not policy.settings(live)['capabilities']['can_book_appointments']:raise ValueError('Prenotazioni disabilitate.')
    old=d.execute('SELECT * FROM bookings WHERE company_id=? AND conversation_id=?',(cid,sid)).fetchone()
    if old:
     if old['slot_id']==slot:return dict(old)
     raise ValueError('Esiste già una prenotazione per questa conversazione.')
    found=d.execute('SELECT * FROM booking_slots WHERE company_id=? AND id=? AND starts>?',(cid,slot,store.now())).fetchone()
    if not found or d.execute('SELECT 1 FROM bookings WHERE company_id=? AND slot_id=?',(cid,slot)).fetchone():raise ValueError('Orario non più disponibile.')
    identifier=store.token();d.execute('INSERT INTO bookings VALUES (?,?,?,?,?)',(identifier,cid,sid,slot,store.now()));hybrid.audit(d,cid,sid,'visitor_confirmed','booking_mock','confirmed')
   return {'id':identifier,'slot_id':slot,'starts':found['starts'],'mock':True}
  except (ValueError,store.Missing):
   with store.connection() as d:hybrid.audit(d,cid,sid,'visitor','booking_mock','denied')
   raise
class LocalChannels:
 """Simulatore server-side; secret mai inviato alla chat o alla dashboard."""
 def bind(self,cid,channel):
  store.company(cid)
  if channel not in ('whatsapp_mock','web'):raise ValueError('Canale locale non valido.')
  identifier=store.token();secret=store.token()
  with store.connection() as d:d.execute('INSERT INTO channel_bindings VALUES (?,?,?,?,1)',(identifier,cid,channel,store.digest(secret)))
  return identifier,secret
 def start(self,identifier,secret,external_id):
  if not isinstance(external_id,str) or not 1<=len(external_id)<=100:raise ValueError('Identità canale non valida.')
  with store.connection() as d:
   row=d.execute('SELECT * FROM channel_bindings WHERE id=? AND enabled=1',(identifier,)).fetchone()
  if not row or not hmac.compare_digest(row['secret_hash'],store.digest(secret)):raise store.Missing()
  cid=row['company_id'];cfg=store.company(cid)['config']
  if row['channel']=='whatsapp_mock':policy.require(cid,cfg,'can_use_whatsapp')
  with store.connection() as d:
   d.execute('BEGIN IMMEDIATE')
   if d.execute('SELECT 1 FROM channel_sessions WHERE binding_id=? AND external_id=?',(identifier,external_id)).fetchone():raise ValueError('Sessione già creata: conserva il token conversazione nel provider locale.')
   company=d.execute('SELECT * FROM companies WHERE id=?',(cid,)).fetchone();access,cfg=store.insert_chat(d,company)
   conv=d.execute('SELECT state FROM conversations WHERE access_hash=?',(store.digest(access),)).fetchone();state=json.loads(conv[0]);state['channel']=row['channel']
   d.execute('UPDATE conversations SET state=? WHERE access_hash=?',(json.dumps(state),store.digest(access)))
   d.execute('INSERT INTO channel_sessions VALUES (?,?,?)',(identifier,external_id,store.digest(access)))
  return access,cfg
 def receive(self,access,message):
  from . import engine
  row,state,cfg=store.conversation(access)
  if state.get('channel')=='whatsapp_mock':policy.require(row['company_id'],cfg,'can_use_whatsapp')
  return engine.respond(row,state,cfg,message)

class CredentialProvider(Protocol):
 def get(self,company_id,connector):
  """A future vault must scope secret lookup to the authenticated company."""
  ...
class UnconfiguredCredentials:
 def get(self,company_id,connector):
  store.company(company_id)
  raise ValueError('Archivio credenziali esterne non configurato. Nessun segreto disponibile.')
