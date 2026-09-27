import { Link } from 'react-router-dom';
import { TRAYECTOS_POPULARES, etiquetaTrayecto, rutaTrayecto } from '@/lib/trayectos';

export function TrayectosPopulares({
  cantidad,
  rutaActual,
}: {
  cantidad?: number;
  rutaActual?: string;
}) {
  const lista = TRAYECTOS_POPULARES.filter(
    (trayecto) => rutaTrayecto(trayecto) !== rutaActual,
  ).slice(0, cantidad);
  return (
    <ul className="flex flex-wrap gap-2">
      {lista.map((trayecto) => {
        const ruta = rutaTrayecto(trayecto);
        return (
          <li key={ruta}>
            <Link
              to={ruta}
              className="inline-block rounded-full border bg-muted/40 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              {etiquetaTrayecto(trayecto)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
