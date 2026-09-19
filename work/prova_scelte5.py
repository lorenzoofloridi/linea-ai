import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
from dialogo import verifica_scelta
for text,expected in [('mi farebbe comodo parlarne con qualcuno al telefono','ricontatto'),('non voglio lasciare il numero','rifiuto'),('se non volessi dare il numero?','incerto')]:
 actual=verifica_scelta(text);print(text,actual,flush=True);assert actual==expected
print('PASS preferenze parafrasate, rifiuto e ipotesi.',flush=True)
