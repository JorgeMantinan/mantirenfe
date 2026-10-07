import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { SELECT_CLS } from '@/lib/ui-constants';
import { BONOS } from '@mantirenfe/shared-types';
import { etiquetasBonos, type EstadoFormulario } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'bono'>;
  onBono: (valor: string) => void;
}

/** Bono con el que se viaja (afecta a la disponibilidad de plazas). */
export function BonoSeccion({ estado, onBono }: Props) {
  const { t } = useTranslation();
  const { bono } = estado;
  // Etiquetas i18n: se recalculan solo cuando cambia el idioma
  const etiquetasBono = useMemo(() => etiquetasBonos(t), [t]);
  return (
    <div className="space-y-2">
      <Label htmlFor="bono">{t('nuevaAlerta.bonoLabel')}</Label>
      <select
        id="bono"
        className={SELECT_CLS}
        value={bono}
        onChange={(e) => onBono(e.target.value)}
      >
        {BONOS.map((b) => (
          <option key={b} value={b}>
            {etiquetasBono[b] ?? b}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{t('nuevaAlerta.bonoTexto')}</p>
    </div>
  );
}
