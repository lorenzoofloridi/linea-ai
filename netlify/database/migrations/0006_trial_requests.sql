-- Site trial requests are separate from customer leads and require their own consent.
CREATE TABLE trial_requests (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 data JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 consent_version TEXT NOT NULL
);
