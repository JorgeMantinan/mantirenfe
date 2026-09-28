import { Link } from 'react-router-dom';
import { TRAYECTOS_POPULARES, etiquetaTrayecto, rutaTrayecto } from '@/lib/trayectos';
import type { Idioma } from '@/lib/trayectos-i18n';

export function TrayectosPopulares({
  cantidad,
  rutaActual,
  lang = 'es',
}: {
  cantidad?: number;
  rutaActual?: string;
  /** Rutas y etiquetas en el idioma pedido (por defecto, español). */
  lang?: Idioma;
}) {
  const lista = TRAYECTOS_POPULARES.filter(
    (trayecto) => rutaTrayecto(trayecto, lang) !== rutaActual,
  ).slice(0, cantidad);
  return (
    <ul className="flex flex-wrap gap-2">
      {lista.map((trayecto) => {
        const ruta = rutaTrayecto(trayecto, lang);
        return (
          <li key={ruta}>
            <Link
              to={ruta}
              className="inline-block rounded-full border bg-muted/40 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              {etiquetaTrayecto(trayecto, lang)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
