CREATE TABLE email_outbox (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    error TEXT,
    UNIQUE(company_id, event_key)
);

CREATE TABLE email_details (
    id TEXT PRIMARY KEY REFERENCES email_outbox(id) ON DELETE CASCADE,
    html TEXT NOT NULL,
    mode TEXT NOT NULL
);

CREATE TABLE email_verification (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    verified_at TIMESTAMPTZ
);

CREATE TABLE email_verification_tokens (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires DOUBLE PRECISION NOT NULL
);

CREATE INDEX idx_email_verification_tokens_user_id
    ON email_verification_tokens(user_id);
