-- Widget da installare sul sito dell'azienda.
-- allowed_origins: siti (https://dominio) che possono mostrare la chat;
-- la pagina del widget li usa come frame-ancestors.
CREATE TABLE widget_settings (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    allowed_origins JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(allowed_origins) = 'array'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE widget_settings ENABLE ROW LEVEL SECURITY;
