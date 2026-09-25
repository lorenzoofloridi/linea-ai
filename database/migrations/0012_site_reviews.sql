-- Recensioni del sito Linea AI (non dei clienti delle aziende).
-- Pubblicate solo con consenso esplicito e dopo approvazione manuale.
CREATE TABLE site_reviews (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 10 AND 1200),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    consent BOOLEAN NOT NULL CHECK (consent),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    moderated_at TIMESTAMPTZ
);

CREATE INDEX idx_site_reviews_public
    ON site_reviews(status, rating DESC, created_at DESC);

ALTER TABLE site_reviews ENABLE ROW LEVEL SECURITY;
