-- Seguridad Supabase/MantiRenfe (idempotente):
--1) El cliente de la app solo usa Supabase AUTH; ninguna tabla necesita PostgREST.
--   Se revocan explícitamente los roles de cliente (hoy no tienen grants: esto
--   impide que un "GRANT" futuro los abra sin querer) y sus privilegios por
--   defecto (tablas que cree `prisma db push` en el futuro).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

--2) RLS activo en TODAS las tablas...
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

--3) ...y policy de la app en TODAS las que NO la tengan (idempotente). El paso2
--   no basta: las tablas que nacen con RLS (event trigger ensure_rls) ya lo
--   tienen y una condición NOT relrowsecurity las saltaría sin policy.
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> '_prisma_migrations'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
          AND p.policyname = 'app_dml'
          AND 'mantirenfe_app' = ANY (p.roles)
      )
  LOOP
    EXECUTE format(
      'CREATE POLICY "app_dml" ON public.%I TO mantirenfe_app USING (true) WITH CHECK (true)',
      t.relname
    );
  END LOOP;
END $$;
