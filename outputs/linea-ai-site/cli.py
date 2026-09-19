"""La stessa AI configurabile del sito, disponibile dal Terminale."""
from saas import store,engine

def main():
 store.init();access,cfg=store.start_chat('demo');print('Assistente: '+engine.greeting(cfg))
 while True:
  try:message=input('\nTu: ').strip()
  except (EOFError,KeyboardInterrupt):print();break
  if message.lower() in ('esci','quit','exit'):break
  if message=='/nuovo':access,cfg=store.start_chat('demo');print('Assistente: '+engine.greeting(cfg));continue
  if not message:continue
  row,state,cfg=store.conversation(access)
  if state['closed']:print('Assistente: Scrivi /nuovo per iniziare una nuova conversazione.');continue
  try:
   print('…',flush=True);reply,_=engine.respond(row,state,cfg,message);print('Assistente: '+reply)
  except Exception:print('Assistente: Al momento non riesco a registrare la richiesta. Riprova tra poco.')
if __name__=='__main__':main()
