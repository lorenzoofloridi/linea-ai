import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'outputs/mio-agente-ai'))
from comprensione import interpreta
cases=[('Vorrei togliere il dente del giudizio','trattamento'),('quando torno dalle ferie','tempistica'),('non prima di Natale','tempistica'),('Ho paura del dentista, mi vergogno un po\u0027','tempistica')]
for text,expected in cases:
 print(text, '->',interpreta(text,{},expected,[],False).model_dump(),flush=True)
