import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SELECT_CLS } from '@/lib/ui-constants';
import { INTERVALOS_SONDEO_MIN, type CriterioAlerta } from '@mantirenfe/shared-types';
import { CRITERIOS, etiquetasCriterioLargas, type EstadoFormulario } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'criterios' | 'conexiones' | 'intervalo' | 'precioObjetivo'>;
  cargandoEdicion: boolean;
  onAlternar: (valor: CriterioAlerta) => void;
  onConexiones: (valor: boolean) => void;
  onIntervalo: (minutos: number) => void;
  onPrecioObjetivo: (valor: string) => void;
}

/**
 * Qué vigila la alerta: chips de criterio (multi-selección) con su casilla de
 * escalas, el intervalo de sondeo y, solo con PRECIO, el precio objetivo.
 */
export function CriteriosSeccion({
  estado,
  cargandoEdicion,
  onAlternar,
  onConexiones,
  onIntervalo,
  onPrecioObjetivo,
}: Props) {
  const { t } = useTranslation();
  const { criterios, conexiones, intervalo, precioObjetivo } = estado;
  const criteriosLargos = useMemo(() => etiquetasCriterioLargas(t), [t]);
  return (
    <>
      <div className="space-y-2">
        <Label>{t('nuevaAlerta.criterioLabel')}</Label>
        <div className="flex flex-wrap gap-2">
          {CRITERIOS.map((valor) => {
            const marcado = criterios.includes(valor);
            return (
              <Button
                key={valor}
                type="button"
                variant={marcado ? 'default' : 'outline'}
                size="sm"
                aria-pressed={marcado}
                disabled={cargandoEdicion}
                onClick={() => onAlternar(valor)}
              >
                {criteriosLargos[valor]}
              </Button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t('nuevaAlerta.criterioPista')}</p>
        {criterios.includes('DISPONIBILIDAD') && (
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <input
              id="conexiones"
              type="checkbox"
              checked={conexiones}
              disabled={cargandoEdicion}
              onChange={(e) => onConexiones(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
            />
            <div className="space-y-1">
              <Label htmlFor="conexiones">{t('nuevaAlerta.conexiones')}</Label>
              <p className="text-xs text-muted-foreground">{t('nuevaAlerta.conexionesPista')}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="intervalo">{t('nuevaAlerta.intervaloLabel')}</Label>
        <select
          id="intervalo"
          className={SELECT_CLS}
          value={intervalo}
          onChange={(e) => onIntervalo(Number(e.target.value))}
        >
          {INTERVALOS_SONDEO_MIN.map((min) => (
            <option key={min} value={min}>
              {t('nuevaAlerta.intervaloCada', { min })}
            </option>
          ))}
        </select>
      </div>

      {criterios.includes('PRECIO') && (
        <div className="space-y-2">
          <Label htmlFor="precioObjetivo">{t('nuevaAlerta.precioLabel')}</Label>
          <Input
            id="precioObjetivo"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={precioObjetivo}
            onChange={(e) => onPrecioObjetivo(e.target.value)}
            placeholder={t('nuevaAlerta.precioPlaceholder')}
            required
          />
          <p className="text-xs text-muted-foreground">{t('nuevaAlerta.precioTexto')}</p>
        </div>
      )}
    </>
  );
}
