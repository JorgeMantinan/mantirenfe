import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { EstacionResponse } from '@mantirenfe/shared-types';

interface OpcionesBuscador {
  /** Filas que se piden a la API (5 en formularios, 8-10 en desplegables grandes). */
  limite?: number;
  /** Espera antes de disparar la petición (ms). */
  esperaMs?: number;
  /** Caracteres mínimos del campo antes de buscar. */
  minimo?: number;
}

/**
 * Autocompletado de estaciones con debounce y guarda de petición: la
 * respuesta de una búsqueda anterior nunca pisa a la última. Lo comparten
 * las páginas de estaciones, trenes, suprimidos, trayectos y alta de alertas.
 */
export function useBuscadorEstaciones(opciones?: OpcionesBuscador) {
  const { limite = 8, esperaMs = 250, minimo = 2 } = opciones ?? {};
  const [sugerencias, setSugerencias] = useState<EstacionResponse[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticion = useRef(0);

  /** Cierra el desplegable y deja sin efecto cualquier respuesta en vuelo. */
  const limpiar = useCallback(() => {
    peticion.current++;
    clearTimeout(timer.current);
    setSugerencias([]);
  }, []);

  const sugerir = useCallback(
    (valor: string) => {
      clearTimeout(timer.current);
      const q = valor.trim();
      if (q.length < minimo) {
        peticion.current++;
        setSugerencias([]);
        return;
      }
      timer.current = setTimeout(() => {
        const id = ++peticion.current;
        api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(q)}&limite=${limite}`)
          .then((r) => {
            if (peticion.current === id) setSugerencias(r);
          })
          .catch(() => {
            if (peticion.current === id) setSugerencias([]);
          });
      }, esperaMs);
    },
    [esperaMs, limite, minimo],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { sugerencias, sugerir, limpiar, setSugerencias };
}
