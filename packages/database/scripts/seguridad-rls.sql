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

--2) RLS en todas las tablas (denegación por defecto para cualquier rol sin
--   BYPASSRLS) + policy explícita para el rol de runtime de la app
--   (mantirenfe_app no tiene bypassrls; `postgres` sí, verificado).
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
      AND NOT c.relrowsecurity
      AND c.relname <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format(
      'CREATE POLICY "app_dml" ON public.%I TO mantirenfe_app USING (true) WITH CHECK (true)',
      t.relname
    );
  END LOOP;
END $$;
