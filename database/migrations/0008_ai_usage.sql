-- Contatore mensile dei messaggi AI per azienda (quote dei piani).
-- Additiva: non modifica tabelle esistenti. Scritta solo dal backend.
CREATE TABLE ai_usage (
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    period TEXT NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, period)
);
