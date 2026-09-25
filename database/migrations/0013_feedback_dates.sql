-- Data di invio dei feedback dei visitatori: serve per ordinarli,
-- mostrarli in dashboard e calcolare le medie per periodo.
-- I feedback già presenti ricevono la data di applicazione della migrazione.
ALTER TABLE feedback
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX idx_feedback_company_created
    ON feedback(company_id, created_at DESC);
