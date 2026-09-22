CREATE TABLE company_knowledge (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN (
            'pending',
            'researching',
            'verified',
            'needs_review',
            'failed'
        )),

    knowledge JSONB NOT NULL DEFAULT '{}'::jsonb,

    sources JSONB NOT NULL DEFAULT '[]'::jsonb,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    error TEXT
);

CREATE TABLE company_knowledge_events (
    id BIGSERIAL PRIMARY KEY,

    company_id TEXT NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL,

    message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_knowledge_status
    ON company_knowledge(status);

CREATE INDEX idx_company_knowledge_events_company
    ON company_knowledge_events(company_id, created_at);