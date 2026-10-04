import { useEffect, useRef } from 'react';

/**
 * Refresco periódico que se pausa con la pestaña oculta: al volver a
 * visible se refresca al instante y se reanuda el intervalo (evita
 * martillear la API con la pestaña en segundo plano).
 */
export function useRefresco(refrescar: () => void, cadaMs: number) {
  const pendiente = useRef(refrescar);

  useEffect(() => {
    pendiente.current = refrescar;
  }, [refrescar]);

  useEffect(() => {
    let intervalo: number | undefined;

    const parar = () => {
      if (intervalo !== undefined) {
        window.clearInterval(intervalo);
        intervalo = undefined;
      }
    };
    const arrancar = () => {
      parar();
      intervalo = window.setInterval(() => pendiente.current(), cadaMs);
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        pendiente.current();
        arrancar();
      } else {
        parar();
      }
    };

    if (document.visibilityState === 'visible') arrancar();
    // Primera carga al montar (si la pestaña está oculta, al volver a visible)
    pendiente.current();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [cadaMs]);
}
