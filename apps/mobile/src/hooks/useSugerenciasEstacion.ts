import { useEffect, useRef, useState } from 'react';
import type { EstacionResponse } from '@mantirenfe/shared-types';
import { api } from '@/lib/api';

/** Espera antes de preguntar a la API mientras la persona sigue escribiendo. */
const DEBOUNCE_MS = 250;

/**
 * Sugerencias de estación para los campos Origen/Destino, compartidas por la
 * pantalla de Trenes y el formulario de alertas:
 *
 * - Una lista por campo: con una sola lista compartida, escribir en Destino
 *   pintaba también las sugerencias debajo de Origen y viceversa.
 * - Debounce de 250 ms y cancelación de la petición pendiente (ref de
 *   petición), para que una respuesta lenta no pise a la más reciente.
 * - Al desmontar se limpia el temporizador.
 *
 * Suprimidos no encaja aquí: usa un único campo con semántica propia (además
 * escribir el texto del filtro) y se queda con su versión local.
 */
export function useSugerenciasEstacion() {
  const [sugOrigen, setSugOrigen] = useState<EstacionResponse[]>([]);
  const [sugDestino, setSugDestino] = useState<EstacionResponse[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peticion = useRef(0);

  /** Cierra las dos listas y cancela la petición pendiente (si la hay). */
  const limpiarSugerencias = () => {
    peticion.current++;
    clearTimeout(timer.current);
    setSugOrigen([]);
    setSugDestino([]);
  };

  const buscarSugerencias = (campo: 'origen' | 'destino', texto: string) => {
    clearTimeout(timer.current);
    const set = campo === 'origen' ? setSugOrigen : setSugDestino;
    // Invalida cualquier respuesta pendiente y cierra la lista del otro campo
    peticion.current++;
    (campo === 'origen' ? setSugDestino : setSugOrigen)([]);
    const q = texto.trim();
    if (q.length < 2) {
      set([]);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++peticion.current;
      api<EstacionResponse[]>(`/estaciones?limite=5&q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (peticion.current === id) set(r);
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return { sugOrigen, sugDestino, buscarSugerencias, limpiarSugerencias };
}
