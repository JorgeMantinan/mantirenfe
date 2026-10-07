import { useTranslation } from 'react-i18next';
import type { EstadoFormulario, ResumenAlerta } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'origen' | 'destino'>;
  resumen: ResumenAlerta;
}

/** Caja de resumen que se repite en el toast final al guardar la alerta. */
export function ResumenSeccion({ estado, resumen }: Props) {
  const { t } = useTranslation();
  const { origen, destino } = estado;
  return (
    <div className="space-y-1 rounded-lg border bg-muted/40 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('nuevaAlerta.resumenTitulo')}
      </p>
      <p className="text-sm font-medium">
        {origen.trim() || '—'} → {destino.trim() || '—'}
      </p>
      <p className="text-xs text-muted-foreground">
        {[resumen.fecha, resumen.franja, resumen.criterio].filter(Boolean).join(' · ')}
      </p>
      {resumen.salidas.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('nuevaAlerta.resumenProximas', { horas: resumen.salidas.join(', ') })}
        </p>
      ) : null}
    </div>
  );
}
