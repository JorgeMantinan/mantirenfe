import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '../../.env' });

/**
 * Salud de la base de datos en el momento exacto: qué corre, quién vacía y
 * cuánto tarda lo mínimo.
 * Uso:  pnpm --filter @mantirenfe/database db:salud
 *
 * Solo lectura. Si algo se pasa de `statement_timeout` (120 s) o la conexión
 * no se abre, eso TAMBIÉN es un dato: la instancia está saturada (es el
 * síntoma del aviso de «Disk IO Budget» de Supabase).
 */
async function main() {
  const prisma = new PrismaClient();
  const cronometro = async (etiqueta: string, sql: string) => {
    const t0 = Date.now();
    try {
      const filas = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
      console.log(`\n== ${etiqueta} (${Date.now() - t0} ms)`);
      console.table(filas);
      return filas;
    } catch (e) {
      console.log(`\n== ${etiqueta} FALLÓ tras ${Date.now() - t0} ms: ${String(e).slice(0, 200)}`);
      return [];
    }
  };

  await cronometro(
    'Latencia básica',
    `SELECT now()::text AS ahora, pg_size_pretty(pg_database_size(current_database())) AS tamano`,
  );

  await cronometro(
    'Consultas activas (¿quién la bloquea?)',
    `SELECT pid, state, wait_event_type || '/' || COALESCE(wait_event, '-') AS espera,
            left((now() - query_start)::text, 12) AS duracion,
            left(regexp_replace(coalesce(query, ''), '\\s+', ' ', 'g'), 110) AS consulta
       FROM pg_stat_activity
      WHERE datname = current_database() AND state <> 'idle'
      ORDER BY query_start LIMIT 20`,
  );

  await cronometro(
    'Vacuums en las últimas 24 h (autovacuum trabajando = E/S)',
    `SELECT relname AS tabla, last_autovacuum, last_vacuum
       FROM pg_stat_user_tables
      WHERE last_autovacuum > now() - interval '24 hours' OR last_vacuum > now() - interval '24 hours'
      ORDER BY last_autovacuum DESC NULLS LAST LIMIT 12`,
  );

  await cronometro(
    'Escrituras por tabla desde el último reinicio',
    `SELECT relname AS tabla, n_live_tup AS vivas, n_dead_tup AS muertas,
            n_tup_ins + n_tup_upd + n_tup_del AS escrituras
       FROM pg_stat_user_tables
      ORDER BY escrituras DESC LIMIT 8`,
  );

  await cronometro(
    'Tamaño por tabla (top 8)',
    `SELECT relname AS tabla, pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
            pg_size_pretty(pg_relation_size(c.oid)) AS heap
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
      ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 8`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
