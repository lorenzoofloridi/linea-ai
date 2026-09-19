import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
import dialogo
Real=dialogo.Client
class DebugClient(Real):
 def chat(self,**kwargs):
  r=super().chat(**kwargs);print('RAW',r.message.content,flush=True);return r
dialogo.Client=DebugClient
print('PARSED',dialogo.verifica_scelta('preferirei essere ricontattato per chiarimenti'),flush=True)
