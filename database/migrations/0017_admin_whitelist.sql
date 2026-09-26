-- Whitelist dei gestori aggiunti dall'area gestore.
-- I gestori principali restano nelle variabili d'ambiente (LINEA_ADMIN_EMAILS).
CREATE TABLE admin_users (
    email TEXT PRIMARY KEY CHECK (email = LOWER(email)),
    added_by TEXT NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
