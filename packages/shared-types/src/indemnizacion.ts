/**
 * Compromiso de Puntualidad de Renfe: umbrales de indemnización por retraso.
 *
 * Fuente única: https://www.renfe.com/es/es/ayuda/compromiso-puntualidad
 * Fecha de consulta: 2026-09-27
 *
 * Escalas tal y como aparecen publicadas (todas las cifras son de la fuente):
 * - Servicios Comerciales (AVE, Avlo, Alvia, Euromed, Intercity y Larga Distancia):
 *   retraso ≥ 60 min → 50%; retraso > 90 min → 100%.
 * - AVE Internacional, recorrido interior español: ≥ 60 min → 50%; > 90 min → 100%.
 * - AVE Internacional, recorrido interior francés: > 30 min → 25%; > 120 min → 50%;
 *   > 180 min → 75%.
 * - AVE Internacional, recorrido internacional (España-Francia): > 30 min → 25%;
 *   > 120 min → 50%.
 * - Avant: > 15 min → 50%; > 30 min → 100%.
 * - Media Distancia: > 15 min → 25%; > 30 min → 50%; > 60 min → 100%.
 * - Regional y Regional Express: > 30 min → 25%; > 45 min → 50%; > 60 min → 100%.
 * - Billetes integrados (Avant+Avant, Avant+Media Distancia, Media+Media):
 *   > 30 min → 50%; > 60 min → 100%.
 * - Resto de enlaces integrados: > 60 min → 50%; > 90 min → 100%.
 *
 * AMBIGÜEDADES detectadas en la fuente (no se codifican umbral porque no hay cifra):
 * - Renfecitos y Cercanías: la página consultada NO publica indemnización por retraso para
 *   esos servicios, así que aquí no se les asigna porcentaje (cualquier umbral sería inventado).
 * - AVE Internacional (tramo francés e internacional) tiene escala propia y nunca llega al
 *   100%; al no conocer el servicio en tiempo real, `funcionIndemnizacion` aplica la escala
 *   conservadora nacional y lo advierte en `descripcion`.
 *
 * Otras condiciones de la fuente (informativas): solicitud a partir de 24 h después de la
 * llegada y hasta 3 meses desde la fecha del viaje; no aplica si el retraso se debe a
 * limitaciones temporales de velocidad de Adif en billetes adquiridos desde el 31 de enero de
 * 2026, ni por fuerza mayor (art. 19.10 del Reglamento (UE) 2021/782). La D.A. 31.ª de la Ley
 * de Movilidad Sostenible (4-dic-2025) prevé un nuevo régimen pendiente de desarrollo
 * reglamentario.
 */

/** Metadatos de la fuente de los umbrales (para pies de página / textos legales). */
export const FUENTE_COMPROMISO_PUNTUALIDAD = {
  titulo: 'Compromiso de puntualidad - Renfe',
  url: 'https://www.renfe.com/es/es/ayuda/compromiso-puntualidad',
  fechaConsulta: '2026-09-27',
} as const;

export interface EscalaIndemnizacion {
  /** Umbral de retraso en segundos (unidad con la que trabaja la app). */
  umbralSeg: number;
  /** `true` cuando la fuente dice "igual o superior" (≥); `false` cuando dice "superior" (>). */
  umbralIncluyente: boolean;
  /** Porcentaje de devolución sobre el importe del billete. */
  porcentaje: number;
}

export interface UmbralesServicio {
  /** Tal y como la denomina la fuente. */
  servicio: string;
  /** Escalas ordenadas de menor a mayor umbral. */
  escalas: readonly EscalaIndemnizacion[];
}

/** Todas las cifras proceden de la página citada en la cabecera (consulta 2026-09-27). */
export const UMBRALES_INDENIZACION: readonly UmbralesServicio[] = [
  {
    servicio: 'Servicios Comerciales (AVE, Avlo, Alvia, Euromed, Intercity, Larga Distancia)',
    escalas: [
      { umbralSeg: 60 * 60, umbralIncluyente: true, porcentaje: 50 },
      { umbralSeg: 90 * 60, umbralIncluyente: false, porcentaje: 100 },
    ],
  },
  {
    servicio: 'AVE Internacional - recorrido interior español',
    escalas: [
      { umbralSeg: 60 * 60, umbralIncluyente: true, porcentaje: 50 },
      { umbralSeg: 90 * 60, umbralIncluyente: false, porcentaje: 100 },
    ],
  },
  {
    servicio: 'AVE Internacional - recorrido interior francés',
    escalas: [
      { umbralSeg: 30 * 60, umbralIncluyente: false, porcentaje: 25 },
      { umbralSeg: 120 * 60, umbralIncluyente: false, porcentaje: 50 },
      { umbralSeg: 180 * 60, umbralIncluyente: false, porcentaje: 75 },
    ],
  },
  {
    servicio: 'AVE Internacional - recorrido internacional (España-Francia)',
    escalas: [
      { umbralSeg: 30 * 60, umbralIncluyente: false, porcentaje: 25 },
      { umbralSeg: 120 * 60, umbralIncluyente: false, porcentaje: 50 },
    ],
  },
  {
    servicio: 'Avant (Servicios Públicos)',
    escalas: [
      { umbralSeg: 15 * 60, umbralIncluyente: false, porcentaje: 50 },
      { umbralSeg: 30 * 60, umbralIncluyente: false, porcentaje: 100 },
    ],
  },
  {
    servicio: 'Media Distancia (Servicios Públicos)',
    escalas: [
      { umbralSeg: 15 * 60, umbralIncluyente: false, porcentaje: 25 },
      { umbralSeg: 30 * 60, umbralIncluyente: false, porcentaje: 50 },
      { umbralSeg: 60 * 60, umbralIncluyente: false, porcentaje: 100 },
    ],
  },
  {
    servicio: 'Regional y Regional Express',
    escalas: [
      { umbralSeg: 30 * 60, umbralIncluyente: false, porcentaje: 25 },
      { umbralSeg: 45 * 60, umbralIncluyente: false, porcentaje: 50 },
      { umbralSeg: 60 * 60, umbralIncluyente: false, porcentaje: 100 },
    ],
  },
  {
    servicio: 'Billetes integrados (Avant+Avant, Avant+MD, MD+MD)',
    escalas: [
      { umbralSeg: 30 * 60, umbralIncluyente: false, porcentaje: 50 },
      { umbralSeg: 60 * 60, umbralIncluyente: false, porcentaje: 100 },
    ],
  },
  {
    servicio: 'Resto de enlaces de billetes integrados',
    escalas: [
      { umbralSeg: 60 * 60, umbralIncluyente: false, porcentaje: 50 },
      { umbralSeg: 90 * 60, umbralIncluyente: false, porcentaje: 100 },
    ],
  },
  // Renfecitos / Cercanías: sin umbrales publicados en la fuente → sin escala codificada.
];

/**
 * Umbral PRINCIPAL conservador: el MAYOR de los umbrales de entrada entre los servicios
 * documentados (60 min, Servicios Comerciales). Avant y Media Distancia pagan ya a partir de
 * 15 min y Regional a partir de 30 min, así que con este umbral se avisa tarde pero seguro.
 */
export const UMBRAL_PRINCIPAL_INDENIZACION_SEG = 60 * 60;

/** Segundo tramo conservador: "retraso superior a 90 minutos → devolución del 100%". */
export const UMBRAL_TOTAL_INDENIZACION_SEG = 90 * 60;

/**
 * Escala aplicada cuando NO conocemos el servicio del tren (caso normal en tiempo real):
 * el umbral conservador (mayor) de la tabla anterior.
 */
export const ESCALA_CONSERVADORA: readonly EscalaIndemnizacion[] = [
  { umbralSeg: UMBRAL_PRINCIPAL_INDENIZACION_SEG, umbralIncluyente: true, porcentaje: 50 },
  { umbralSeg: UMBRAL_TOTAL_INDENIZACION_SEG, umbralIncluyente: false, porcentaje: 100 },
];

export interface IndemnizacionRetraso {
  /** Umbral (en segundos) que se ha alcanzado y que da derecho a indemnización. */
  umbralSeg: number;
  /**
   * Porcentaje de devolución según la escala conservadora. Reservado a `null` para el caso en
   * que el retraso sea indemnizable pero la fuente no permita fijar un único porcentaje sin
   * conocer el servicio; hoy la escala conservadora siempre lo determina (50% o 100%).
   */
  porcentaje: number | null;
  /** Texto listo para mostrar: "retraso ≥ 60 min → 50% de devolución (según servicio)". */
  descripcion: string;
}

function describirEscala(escala: EscalaIndemnizacion): string {
  const operador = escala.umbralIncluyente ? '≥' : '>';
  const minutos = escala.umbralSeg / 60;
  return `retraso ${operador} ${minutos} min → ${escala.porcentaje}% de devolución (según servicio)`;
}

/**
 * Devuelve información de indemnización si `retrasoSeg` alcanza el umbral principal
 * conservador (≥ 60 min), o `null` si el retraso es inferior (o el dato no es válido).
 *
 * No conoce el tipo de servicio, por lo que usa `ESCALA_CONSERVADORA` (umbral mayor) y
 * avisa en `descripcion` de que el porcentaje real depende del servicio.
 */
export function funcionIndemnizacion(retrasoSeg: number): IndemnizacionRetraso | null {
  if (!Number.isFinite(retrasoSeg) || retrasoSeg < 0) return null;

  // Escalas ordenadas de menor a mayor: recorremos de atrás hacia adelante para quedarnos
  // con el tramo más alto alcanzado (ES2022 no incluye Array.findLast).
  for (let i = ESCALA_CONSERVADORA.length - 1; i >= 0; i--) {
    const escala = ESCALA_CONSERVADORA[i];
    if (!escala) continue;
    const alcanzado = escala.umbralIncluyente
      ? retrasoSeg >= escala.umbralSeg
      : retrasoSeg > escala.umbralSeg;
    if (alcanzado) {
      return {
        umbralSeg: escala.umbralSeg,
        porcentaje: escala.porcentaje,
        descripcion: describirEscala(escala),
      };
    }
  }

  return null;
}
