-- Chiusura dello schema public su Supabase.
-- Il backend di Linea AI accede come proprietario delle tabelle (bypassa RLS).
-- Nessun client esterno (Data API, chiave anon/authenticated) deve poter
-- leggere o scrivere: RLS attiva senza policy = accesso negato a tutti gli altri.
-- Idempotente e compatibile con PostgreSQL locale (ruoli Supabase assenti).

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM %I', current_schema(), r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', current_schema(), r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM %I', current_schema(), r);
      -- Anche per le tabelle create in futuro dal proprietario attuale.
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM %I', current_schema(), r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM %I', current_schema(), r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM %I', current_schema(), r);
    END IF;
  END LOOP;
END
$$;
