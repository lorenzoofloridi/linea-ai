import sys
import json
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path('outputs/mio-agente-ai').resolve()))
from bot_core import Raccolta, salva_lead
with tempfile.TemporaryDirectory() as temp:
    path = Path(temp)/'leads.txt'
    r = Raccolta(path)
    r.ricevi('Paziente Demo')
    r.ricevi('non è un telefono')
    assert 'telefono' not in r.dati
    for text in ['+39 000 000 0000', 'Controllo', 'Da concordare']:
        r.ricevi(text)
    assert not path.exists()
    r.ricevi('forse')
    assert not path.exists()
    r.ricevi('no')
    assert not path.exists() and r.dati == {} and r.chiuso
    r = Raccolta(path)
    for text in ['Paziente Demo', '+39 000 000 0000', 'Controllo', 'Da concordare', 'sì']:
        r.ricevi(text)
    data=json.loads(path.read_text())
    assert data['consenso_privacy'] is True and data['telefono'] == '+390000000000'
    assert data['stato'] == 'Nuovo'
    r.ricevi('sì')
    assert len(path.read_text().splitlines()) == 1
    try:
        salva_lead({'consenso_privacy': False}, path)
    except ValueError:
        pass
    else:
        raise AssertionError('Consent enforcement failed')
    assert (path.stat().st_mode & 0o777) == 0o600
print('PASS: campi, telefono, consenso ambiguo/rifiutato, salvataggio, no duplicati, permessi file. Nessun lead di prova nel progetto.')
