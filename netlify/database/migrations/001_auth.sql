CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    public_id TEXT UNIQUE NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE company_management (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    config_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
);

CREATE TABLE registration_consents (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    terms_version TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    marketing_analysis BOOLEAN NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE auth_sessions (
    hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires DOUBLE PRECISION NOT NULL
);

CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_users_company_id ON users(company_id);
