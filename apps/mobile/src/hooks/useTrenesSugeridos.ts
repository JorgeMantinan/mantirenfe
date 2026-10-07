import { useEffect, useRef } from 'react';
import { horaGtfs, type HorarioTrenResponse } from '@mantirenfe/shared-types';
import { locale } from '@/i18n';
import { api } from '@/lib/api';

/** Espera antes de pedir horarios mientras la ruta sigue cambiando. */
const DEBOUNCE_MS = 400;

/**
 * Los 3 próximos trenes de la ruta para sugerirlos como «tren concreto».
 *
 * Misma mecánica que `useSugerenciasEstacion` (la comparte con la pantalla de
 * trenes): debounce, cancelación de la petición pendiente y desmonte limpio.
 * El resultado lo entrega la pantalla vía `onTrenes`, así que el estado sigue
 * viviendo en el orquestador.
 *
 * Con `fecha` vacía (o con `flexible`) no hay día del que sugerir salidas.
 */
export function useTrenesSugeridos(
  origen: string,
  destino: string,
  fecha: string,
  flexible: boolean,
  hoyIso: string,
  onTrenes: (trenes: HorarioTrenResponse[]) => void,
): void {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticion = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    // Con "cualquier fecha" no hay día del que sugerir salidas
    if (flexible || origen.trim().length < 2 || destino.trim().length < 2 || !fecha) {
      onTrenes([]);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++peticion.current;
      api<{ trenes: HorarioTrenResponse[] }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fecha}`,
      )
        .then((d) => {
          if (peticion.current !== id) return;
          const horaAhora = new Intl.DateTimeFormat(locale(), {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date());
          const futuros = d.trenes.filter((t) => {
            if (t.transbordo) return false;
            if (fecha !== hoyIso) return true;
            return horaGtfs(t.salida) > horaAhora;
          });
          onTrenes(futuros.slice(0, 3));
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [origen, destino, fecha, flexible, hoyIso, onTrenes]);
}
