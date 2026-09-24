CREATE TABLE company_verification (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','under_review','verified','rejected','suspended')),
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE company_verification_audit (
    id BIGSERIAL PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    actor TEXT NOT NULL,
    previous TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE plan_demo_usage (
    email TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    started DOUBLE PRECISION NOT NULL,
    ends DOUBLE PRECISION NOT NULL
);

CREATE TABLE plan_profiles (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    status TEXT NOT NULL
        CHECK(status IN ('pending','verified','rejected','needs_review')),
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE plan_subscriptions (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK(plan IN ('base','plus','advanced')),
    period TEXT NOT NULL CHECK(period IN ('monthly','annual')),
    status TEXT NOT NULL
        CHECK(status IN ('trial','active','cancelled','past_due','expired')),
    trial_start DOUBLE PRECISION NOT NULL,
    trial_end DOUBLE PRECISION NOT NULL,
    period_end DOUBLE PRECISION NOT NULL,
    cancel_at_end BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at DOUBLE PRECISION,
    method_kind TEXT NOT NULL,
    customer_ref TEXT NOT NULL,
    method_ref TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    provider TEXT NOT NULL DEFAULT 'mock',
    grace_until DOUBLE PRECISION,
    pending_plan TEXT,
    pending_period TEXT
);

CREATE TABLE plan_events (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    outcome TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    created DOUBLE PRECISION NOT NULL
);

CREATE TABLE plan_commands (
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    command_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY(company_id, command_key)
);

CREATE INDEX idx_plan_events_company_created
    ON plan_events(company_id, created);
