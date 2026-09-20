"""Email delivery adapter; queue and tenant identity stay in mail.py."""
import ssl,smtplib
from email.message import EmailMessage
from typing import Protocol
class EmailTransport(Protocol):
 def send(self,message:dict,config:dict)->None:...
class SMTPTransport:
 def send(self,row,cfg):
  msg=EmailMessage();msg['From']=cfg['sender'];msg['To']=row['recipient'];msg['Subject']=row['subject'];msg['Message-ID']='<'+row['id']+'@linea-ai.local>';msg.set_content(row['body'])
  if row.get('html'):msg.add_alternative(row['html'],subtype='html')
  if int(cfg['port'])==465:client=smtplib.SMTP_SSL(cfg['host'],465,timeout=20,context=ssl.create_default_context())
  else:
   client=smtplib.SMTP(cfg['host'],int(cfg['port']),timeout=20);client.starttls(context=ssl.create_default_context())
  with client:
   client.login(cfg['username'],cfg['password']);refused=client.send_message(msg)
   if refused:raise RuntimeError('Destinatario rifiutato')
