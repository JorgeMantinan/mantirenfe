import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '../../.env' });

/**
 * Diagnóstico de E/S (Disk IO) de la base de datos.
 * Uso: pnpm --filter @mantirenfe/database db:io
 *
 * SOLO LECTURA: consulta vistas de `pg_stat_*` y `pg_settings`; no escribe ni
 * bloquea nada (los pg_stat_* son lecturas sobre caché del colector, no
 * escanean tablas).
 *
 * Contexto: Supabase avisa cuando el proyecto agota su presupuesto DIARIO de
 * Disk IO (escrituras de páginas + índices + WAL + autovacuum). Este script
 * responde qué tablas escriben, cuáles se leen y qué índices no usa nadie.
 */
interface Fila {
  [clave: string]: string | number | Date | null;
}

function tabla(titulo: string, filas: Fila[], columnas: string[]): void {
  console.log(`\n== ${titulo}`);
  if (filas.length === 0) {
    console.log('   (sin datos)');
    return;
  }
  const anchos = columnas.map((col) =>
    Math.max(col.length, ...filas.map((f) => String(f[col] ?? '').length)),
  );
  console.log('   ' + columnas.map((col, i) => col.padEnd(anchos[i])).join('  '));
  for (const fila of filas) {
    console.log(
      '   ' + columnas.map((col, i) => String(fila[col] ?? '').padEnd(anchos[i])).join('  '),
    );
  }
}

async function main() {
  const prisma = new PrismaClient();

  const escrituras = await prisma.$queryRawUnsafe<Fila[]>(`
    SELECT s.relname AS tabla,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
           pg_size_pretty(pg_relation_size(c.oid)) AS heap,
           pg_size_pretty(COALESCE(
             (SELECT sum(pg_relation_size(i.indexrelid)) FROM pg_stat_user_indexes i
               WHERE i.schemaname='public' AND i.relid=s.relid), 0)) AS indices,
           n_live_tup AS vivas,
           n_dead_tup AS muertas,
           n_tup_ins AS ins,
           n_tup_upd AS upd,
           n_tup_del AS del,
           (n_tup_ins + n_tup_upd + n_tup_del) AS escrituras,
           seq_scan AS seq,
           idx_scan AS idx,
           last_autovacuum AS ult_autovac
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
     WHERE schemaname = 'public'
     ORDER BY escrituras DESC
     LIMIT 15`);
  tabla('Escrituras desde el último reset de estadísticas (ins+upd+del)', escrituras, [
    'tabla',
    'total',
    'heap',
    'indices',
    'vivas',
    'muertas',
    'ins',
    'upd',
    'del',
    'escrituras',
    'seq',
    'idx',
    'ult_autovac',
  ]);

  const tamanos = await prisma.$queryRawUnsafe<Fila[]>(`
    SELECT s.relname AS tabla,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
           n_live_tup AS vivas,
           n_dead_tup AS muertas,
           round(100.0 * n_dead_tup / GREATEST(n_live_tup + n_dead_tup, 1), 1) AS pct_muertas,
           seq_scan AS seq_scan,
           seq_tup_read AS tup_leidas,
           idx_scan AS idx_scan,
           idx_tup_fetch AS tup_indice
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
     WHERE schemaname = 'public'
     ORDER BY pg_total_relation_size(c.oid) DESC
     LIMIT 15`);
  tabla('Tamaño y lecturas (seq_scan con muchas tuplas = lectura cara)', tamanos, [
    'tabla',
    'total',
    'vivas',
    'muertas',
    'pct_muertas',
    'seq_scan',
    'tup_leidas',
    'idx_scan',
    'tup_indice',
  ]);

  const indices = await prisma.$queryRawUnsafe<Fila[]>(`
    SELECT i.indexrelname AS indice,
           i.relname AS tabla,
           pg_size_pretty(pg_relation_size(i.indexrelid)) AS tamano,
           i.idx_scan AS usos
      FROM pg_stat_user_indexes i
     WHERE i.schemaname='public'
     ORDER BY pg_relation_size(i.indexrelid) DESC
     LIMIT 20`);
  tabla('Índices (usos = 0 → candidato a eliminar)', indices, [
    'indice',
    'tabla',
    'tamano',
    'usos',
  ]);

  const config = await prisma.$queryRawUnsafe<Fila[]>(`
    SELECT name AS parametro, setting AS valor, unit
      FROM pg_settings
     WHERE name IN ('shared_buffers','effective_cache_size','maintenance_work_mem',
                    'work_mem','autovacuum','autovacuum_naptime','default_statistics_target',
                    'wal_compression','max_wal_size','checkpoint_timeout','random_page_cost',
                    'statement_timeout','idle_in_transaction_session_timeout','lock_timeout')
     ORDER BY name`);
  tabla('Ajustes del servidor relevantes para E/S', config, ['parametro', 'valor', 'unit']);

  const actividad = await prisma.$queryRawUnsafe<Fila[]>(`
    SELECT state AS estado,
           wait_event_type AS espera_tipo,
           wait_event AS espera,
           left((now() - query_start)::text, 12) AS duracion,
           left(regexp_replace(query, '\\s+', ' ', 'g'), 90) AS consulta
      FROM pg_stat_activity
     WHERE datname = current_database() AND state <> 'idle'
     ORDER BY query_start
     LIMIT 10`);
  tabla('Consultas activas ahora mismo', actividad, [
    'estado',
    'espera_tipo',
    'espera',
    'duracion',
    'consulta',
  ]);

  const base = await prisma.$queryRawUnsafe<Fila[]>(`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS tamano_bd,
           numbackends AS conexiones,
           xact_commit AS commits,
           xact_rollback AS rollbacks,
           blks_read AS bloques_leidos,
           blks_hit AS bloques_cache,
           tup_inserted AS filas_ins,
           tup_updated AS filas_upd,
           tup_deleted AS filas_del,
           round(extract(epoch from (now() - pg_postmaster_start_time()))/86400, 1)::text AS dias_estadisticas,
           stats_reset AS reset
      FROM pg_stat_database WHERE datname = current_database()`);
  tabla('Base de datos (los contadores acumulan desde `dias_estadisticas`)', base, [
    'tamano_bd',
    'conexiones',
    'commits',
    'rollbacks',
    'bloques_leidos',
    'bloques_cache',
    'filas_ins',
    'filas_upd',
    'filas_del',
    'dias_estadisticas',
    'reset',
  ]);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
