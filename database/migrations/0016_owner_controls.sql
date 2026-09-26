-- Controlli del gestore e cambi di piano.
--
-- 1) Visita della dashboard di un'azienda da parte del gestore: legata alla
--    sessione del gestore (scade da sola, sparisce all'uscita). In visita
--    richieste e conversazioni dei clienti non sono accessibili.
ALTER TABLE auth_sessions ADD COLUMN view_company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE auth_sessions ADD COLUMN view_until DOUBLE PRECISION;

-- 2) Prezzo del piano programmato (downgrade o cambio di periodo al rinnovo).
ALTER TABLE plan_subscriptions ADD COLUMN pending_amount_cents INTEGER;

-- 3) Registro delle azioni del gestore. Nessun vincolo verso companies:
--    la riga resta anche dopo l'eliminazione di un account.
CREATE TABLE admin_log (
    id BIGSERIAL PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    company_id TEXT NOT NULL,
    company_name TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_log_company ON admin_log(company_id, created_at);
ALTER TABLE admin_log ENABLE ROW LEVEL SECURITY;
