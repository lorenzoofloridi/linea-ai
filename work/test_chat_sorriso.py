import sys
from pathlib import Path
sys.path.insert(0,str(Path('outputs/mio-agente-ai').resolve()))
from bot_core import Conversazione, Estrazione, consenso, START
class Writer:
    def __init__(self, fail=False): self.rows=[]; self.fail=fail
    def add_to_sheet(self,data,consent):
        assert consent is True
        self.rows.append(data)
        if self.fail: raise RuntimeError('offline')
def extraction(*args):
    return Estrazione(nome='Anna Demo',telefono='+39 000 000 0000',trattamento='igiene',tempistica='a breve',richiesta='informazioni',intento='dati')
message='Anna Demo +39 000 000 0000 igiene a breve informazioni'
for answer, expected in [('sì',1),('no',0),('forse',0),('non so',0)]:
    w=Writer(); c=Conversazione(w,extraction)
    c.ricevi(message); assert not w.rows
    out=c.ricevi(answer); assert len(w.rows)==expected
    if expected:
        assert 'Ho registrato' in out
        c.ricevi('sì'); assert len(w.rows)==1
w=Writer(True); c=Conversazione(w,extraction); c.ricevi(message)
assert 'Ho registrato' not in c.ricevi('sì')
c.ricevi('sì'); assert len(w.rows)==1
assert consenso('no') is False and consenso('non so') is None
assert 'Come posso aiutarti oggi?' in START
print('PASS consenso, rifiuto, ambiguità, telefono preservato, errore, singolo invio.')
