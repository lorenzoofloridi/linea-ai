-- Note interne del team aziendale su una conversazione (visibili solo alla stessa azienda).
CREATE TABLE company_notes (
    id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, id),
    FOREIGN KEY (company_id, conversation_id)
        REFERENCES conversations(company_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_company_notes_company_created
    ON company_notes(company_id, created_at);

ALTER TABLE company_notes ENABLE ROW LEVEL SECURITY;
