/**
 * ¿Un fallo viene de que la base de datos no da para más y no de un bug del
 * worker?
 *
 * De madrugada el presupuesto de Disk IO de Supabase se agota y pasan dos
 * cosas (ambas medidas en los logs de Actions):
 *
 *  1. `Can't reach database server` (P1001): el pooler tarda más de
 *     `connection_timeout` en aceptar.
 *  2. `canceling statement due to statement timeout` (PG 57014): la instancia
 *     está tan saturada que consultas ligeras tardan > 120 s.
 *
 * Un fallo así **no es un fallo del worker**: se reintenta y, si sigue, la
 * tirada se marca como aviso (amarillo) y sale en 0, para que no salte el
 * correo de «Failed in N seconds» de madrugada ni se tape un fallo real.
 * Todo lo demás (SQL malo, tablas que no existen, feeds caídos…) sigue
 * fallando en rojo.
 */

/** Códigos de Prisma que significan «no llego a la BD o a su pool». */
const CODIGOS_PRISMA = new Set([
  'P1001', // Can't reach database server
  'P1002', // La conexión tardó demasiado en abrirse
  'P1008', // Timeout de operaciones (pool agotado)
  'P1011', // Error abriendo TLS
  'P1017', // El servidor cerró la conexión
  'P2024', // Timeout esperando conexión del pool
  'P2028', // Timeout de la API de transacciones
]);

/** Códigos de PostgreSQL que significan «no hay servicio o se cayó por tiempo». */
const CODIGOS_POSTGRES = new Set([
  '08000', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '40001', // serialization_failure
  '40003', // statement_completion_unknown
  '40P01', // deadlock_detected
  '53200', // out_of_memory
  '53300', // too_many_connections
  '55P03', // lock_not_available
  '57014', // canceling statement due to statement_timeout
]);

/** Mensajes de red/timeout que no siempre traen código asociado. */
const MENSAJES = [
  /can't reach database server/i,
  /operations timed out/i,
  /connection pool/i,
  /canceling statement due to/i,
  /connection terminated/i,
  /timeout of \d+ms exceeded/i,
  /\bETIMEDOUT\b|\bECONNRESET\b|\bECONNREFUSED\b|\bEPIPE\b|\bgetaddrinfo\b/i,
];

interface ErrorConCodigo {
  code?: unknown;
  meta?: unknown;
  message?: unknown;
}

/**
 * Clasifica un error como «indisponibilidad de la base de datos».
 * Acepta cualquier cosa (los errores de la app llegan de tipos muy variados).
 */
export function esIndisponibilidadDeBaseDeDatos(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as ErrorConCodigo;

  if (typeof e.code === 'string' && CODIGOS_PRISMA.has(e.code)) return true;

  // Prisma envuelve los errores de PG en `meta.code` (p. ej. P2010 + 57014).
  // OJO: ahí también llegan errores de SQL (42xxx) que NO son indisponibilidad.
  if (typeof e.meta === 'object' && e.meta !== null) {
    const codigoPg = (e.meta as { code?: unknown }).code;
    if (typeof codigoPg === 'string' && CODIGOS_POSTGRES.has(codigoPg)) return true;
  }

  const mensaje = typeof e.message === 'string' ? e.message : String(error);
  return MENSAJES.some((re) => re.test(mensaje));
}
