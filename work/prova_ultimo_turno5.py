import sys,traceback
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'outputs/mio-agente-ai'))
import comprensione
from bot_core import Conversazione
original=comprensione.interpreta

def traced(*args):
 try:
  p=original(*args);print('INTERPRETAZIONE',p.model_dump(),flush=True);return p
 except Exception:
  traceback.print_exc();raise
c=Conversazione(Mock(),parser=traced)
c.dati={'trattamento':'Ortodonzia'};c.originali={'trattamento':"mettere l'apparecchio"};c.atteso='modalita'
c.storia += [{'role':'user','content':"devo mettere l'apparecchio"},{'role':'assistant','content':"Ho capito: Ortodonzia. Conserverò anche la tua richiesta originale. Preferisci chiedere una visita oppure essere ricontattato per chiarimenti? Possiamo anche continuare con le tue domande qui."},{'role':'user','content':'se registri come ortodonzia poi il dottore capisce quello che mi serve?'},{'role':'assistant','content':"La categoria «Ortodonzia» sarà accompagnata dalle tue parole: «mettere l'apparecchio», così la richiesta mantiene il dettaglio. Per valutare il caso servirà comunque il confronto con un professionista."}]
print(c.ricevi('preferirei essere ricontattato per chiarimenti'),flush=True)
assert c.modalita=='ricontatto' and not c.rifiutato and c.dati['trattamento']=='Ortodonzia'
c.writer.add_to_sheet.assert_not_called()
print('PASS ultimo turno nella cronologia originale.',flush=True)
