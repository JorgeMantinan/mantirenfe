import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '../../.env' });

/**
 * Auditoría + corrección de privilegios del schema public.
 * Uso: pnpm --filter @mantirenfe/database db:audit
 *
 * - Revoca a anon/authenticated/service_role el acceso a todas las tablas,
 *   secuencias y (a anon) functions del schema public: la app no usa PostgREST,
 *   solo el rol mantirenfe_app vía Prisma.
 * - Comprueba que mantirenfe_app es un rol restringido (sin super/bypassrls).
 *
 * Nota: los default privileges heredados de supabase_admin no se pueden alterar
 * desde postgres; este script revoca sus efectos en las tablas existentes.
 * Ejecútalo tras cada `db push` (o deja el cron de tu elección).
 */
async function main() {
  const prisma = new PrismaClient();
  const problemas: string[] = [];

  const revocaciones = [
    ['ALL ON ALL TABLES IN SCHEMA public', 'anon, authenticated, service_role'],
    ['ALL ON ALL SEQUENCES IN SCHEMA public', 'anon, authenticated, service_role'],
    ['ALL ON ALL FUNCTIONS IN SCHEMA public', 'anon'],
  ] as const;

  for (const [que, quien] of revocaciones) {
    try {
      await prisma.$executeRawUnsafe(`REVOKE ${que} FROM ${quien}`);
    } catch (e) {
      problemas.push(`Revocar ${que} de ${quien}: ${String(e).slice(0, 120)}`);
    }
  }

  // Tablas creadas por fuera (db push en otros entornos / dashboard) pueden nacer
  // con RLS activo y sin policies: eso niega al rol de la app. Se desactiva aquí.
  try {
    const conRls = await prisma.$queryRawUnsafe<Array<{ relname: string }>>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`,
    );
    for (const tabla of conRls) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "${tabla.relname}" DISABLE ROW LEVEL SECURITY`);
      console.log(`RLS desactivado en ${tabla.relname}`);
    }
  } catch (e) {
    problemas.push(`Desactivar RLS: ${String(e).slice(0, 120)}`);
  }

  // El rol de la app necesita DML en todas las tablas (idempotente)
  try {
    await prisma.$executeRawUnsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mantirenfe_app',
    );
    await prisma.$executeRawUnsafe(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mantirenfe_app',
    );
  } catch (e) {
    problemas.push(`Garantizar DML a mantirenfe_app: ${String(e).slice(0, 120)}`);
  }

  const grants = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT grantee, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS priv, count(DISTINCT table_name)::int AS tablas
     FROM information_schema.role_table_grants WHERE table_schema='public' GROUP BY grantee ORDER BY grantee`,
  );
  console.log('Grants en public:');
  grants.forEach((g) => console.log(`  ${g.grantee}: ${g.priv} (${g.tablas} tablas)`));

  const accesosNoDeseados = grants.filter((g) =>
    ['anon', 'authenticated', 'service_role'].includes(String(g.grantee)),
  );
  if (accesosNoDeseados.length > 0) {
    problemas.push(
      `Acceso residual de ${accesosNoDeseados.map((a) => a.grantee).join(', ')} en public`,
    );
  }

  const rol = (
    await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname='mantirenfe_app'`,
    )
  )[0];
  if (!rol) {
    problemas.push('No existe el rol mantirenfe_app');
  } else if (rol.rolsuper || rol.rolbypassrls || rol.rolcreatedb || rol.rolcreaterole) {
    problemas.push(`El rol mantirenfe_app tiene privilegios de más: ${JSON.stringify(rol)}`);
  } else {
    console.log('Rol mantirenfe_app: restringido OK (solo DML, sin super/bypassrls)');
  }

  const rls = (
    await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity`,
    )
  )[0];
  console.log(
    `Tablas con RLS activo: ${rls?.n ?? '?'} (informativo: el control aquí es por grants)`,
  );

  await prisma.$disconnect();

  if (problemas.length > 0) {
    console.error('PROBLEMAS:');
    problemas.forEach((p) => console.error(' -', p));
    process.exit(1);
  }
  console.log('Auditoría OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
