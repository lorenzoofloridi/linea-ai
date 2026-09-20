from runtime_config import DATA
"""Registro locale delle consegne: conserva il lead autorizzato, non tutta la chat."""
import json,os,sqlite3,uuid
from datetime import datetime,timezone
from pathlib import Path
class LeadOutbox:
    def __init__(self,path=None):
        self.path=Path(path) if path else (DATA/'agente.db' if (DATA/'agente.db').exists() or not (Path(__file__).resolve().parents[1]/'data/agente.db').exists() else Path(__file__).resolve().parents[1]/'data/agente.db')
        self.path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    def connect(self):
        db=sqlite3.connect(self.path,timeout=5)
        self.path.chmod(0o600)
        db.execute('CREATE TABLE IF NOT EXISTS lead_delivery (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, consent_evidence TEXT NOT NULL, status TEXT NOT NULL, remote_range TEXT, error_type TEXT)')
        return db
    def prepare(self,company_id,source,payload,consent_evidence):
        if not consent_evidence:raise ValueError('Consenso documentato mancante')
        identifier=uuid.uuid4().hex
        with self.connect() as db:
            db.execute('INSERT INTO lead_delivery VALUES (?,?,?,?,?,?,?,?,?)',(identifier,company_id,datetime.now(timezone.utc).isoformat(),source,json.dumps(payload,ensure_ascii=False),consent_evidence,'prepared',None,None))
        return identifier
    def mark(self,identifier,status,remote_range=None,error_type=None):
        if status not in ('delivering','confirmed','uncertain'):raise ValueError('Stato non valido')
        with self.connect() as db:
            db.execute('UPDATE lead_delivery SET status=?,remote_range=COALESCE(?,remote_range),error_type=? WHERE id=?',(status,remote_range,error_type,identifier))
