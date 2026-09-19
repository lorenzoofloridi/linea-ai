import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from comprensione import interpreta
p=interpreta('preferisco una visita',{'trattamento':'Ortodonzia'},'modalita',[{'role':'assistant','content':'Preferisci chiedere una visita oppure essere ricontattato per chiarimenti?'}],False)
print(p.model_dump(),flush=True)
assert p.modalita=='visita' and not p.trattamento
print('PASS: la scelta visita non sovrascrive il trattamento.',flush=True)
