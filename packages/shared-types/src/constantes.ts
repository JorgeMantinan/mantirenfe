export const COLA_SONDEO = 'sondeo-alertas';
export const COLA_SONDEO_MASIVO = 'sondeo-masivo';
export const COLA_SYNC_GTFS = 'sync-gtfs';

export const INTERVALOS_SONDEO_MIN = [5, 10, 15, 30, 60] as const;

export const BONOS = [
  'GENERAL',
  'BONO_10',
  'BONO_20',
  'JUVENIL',
  'ESTUDIANTE',
  'DISCAPACIDAD',
  'FAMILIA_NUMEROSA',
  'MAYOR_60',
  'OTRO',
] as const;

export const OPERADORES = ['RENFE', 'AVLO', 'OUIGO', 'IRYO', 'OTRO'] as const;

/**
 * true si el `operador` de `horarioTren` corresponde a OUIGO. Los feeds de
 * Renfe guardan marcas ("AVE", "AVLO", "MD") o el nombre de la ruta; el de
 * OUIGO se importa con el operador literal "OUIGO".
 */
export function esOuigo(operador?: string | null): boolean {
  return (operador ?? '').toUpperCase().includes('OUIGO');
}

export const TITULO_APP = 'MantiRenfe';

/**
 * Días hacia delante que guarda el sync GTFS (`GTFS_DIAS_VENTANA`).
 *
 * Con 45 (ventana de 52 días: 7 de historial + 45) `ParadaHorario` pesaba
 * 538 MB — el 80 % de la base entera y por encima de los 500 MB del plan
 * Free de Supabase. Bajarlo a 25 deja la BD en torno a 430 MB, dentro del
 * límite, con un coste: las alertas y los horarios solo llegan 32 días
 * (7 + 25) por delante. La web limita la fecha del formulario con
 * `fechaMaximaAlerta` y la API la valida, para que nadie cree una alerta
 * que no se pueda sondear.
 *
 * ÚNICA fuente de verdad: sync (por defecto), API (validación) y formulario.
 */
export const VENTANA_GTFS_DIAS = 25;

/**
 * Fecha máxima ('YYYY-MM-DD') que puede llevar una alerta: hoy peninsular +
 * `VENTANA_GTFS_DIAS` (los horarios de esa fecha ya están en la BD).
 * Lanza `FECHA_INVALIDA_<valor>` si el día no viene en formato ISO.
 */
export function fechaMaximaAlerta(hoyIso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoyIso);
  if (!partes) throw new Error(`FECHA_INVALIDA_${hoyIso}`);
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  return new Date(Date.UTC(anio, mes - 1, dia + VENTANA_GTFS_DIAS)).toISOString().slice(0, 10);
}
