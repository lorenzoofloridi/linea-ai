CREATE TABLE conversations (
    id TEXT NOT NULL,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    access_hash TEXT UNIQUE NOT NULL,
    state JSONB NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    expires DOUBLE PRECISION NOT NULL,
    PRIMARY KEY(company_id, id)
);

CREATE TABLE messages (
    company_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(company_id, conversation_id, seq),
    FOREIGN KEY(company_id, conversation_id)
        REFERENCES conversations(company_id, id) ON DELETE CASCADE
);

CREATE TABLE leads (
    id TEXT NOT NULL,
    company_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    data JSONB NOT NULL,
    status TEXT NOT NULL
        CHECK(status IN ('Nuova','Da contattare','In lavorazione','Completata')),
    summary TEXT NOT NULL,
    consent TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(company_id, id),
    UNIQUE(company_id, conversation_id),
    FOREIGN KEY(company_id, conversation_id)
        REFERENCES conversations(company_id, id) ON DELETE CASCADE
);

CREATE TABLE feedback (
    company_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL,
    PRIMARY KEY(company_id, conversation_id),
    FOREIGN KEY(company_id, conversation_id)
        REFERENCES conversations(company_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_leads_company_created
    ON leads(company_id, created_at);

CREATE INDEX idx_conversations_company_updated
    ON conversations(company_id, updated_at);
