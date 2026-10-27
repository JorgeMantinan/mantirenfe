import { useTranslation } from 'react-i18next';
import { VENTANA_GTFS_DIAS } from '@mantirenfe/shared-types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EstadoFormulario } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'frecuencia' | 'fecha' | 'horaDesde' | 'horaHasta'>;
  /** Fecha mínima aceptada por el input (hoy). */
  fechaMin: string;
  /** Fecha máxima (hoy + VENTANA_GTFS_DIAS): hasta ahí llegan los horarios. */
  fechaMax: string;
  onFecha: (valor: string) => void;
  onHoraDesde: (valor: string) => void;
  onHoraHasta: (valor: string) => void;
}

/** Fecha concreta (solo con frecuencia "fecha") y franja horaria de la ida. */
export function FranjaSeccion({
  estado,
  fechaMin,
  fechaMax,
  onFecha,
  onHoraDesde,
  onHoraHasta,
}: Props) {
  const { t } = useTranslation();
  const { frecuencia, fecha, horaDesde, horaHasta } = estado;
  return (
    <div className={`grid gap-4 ${frecuencia === 'fecha' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {frecuencia === 'fecha' && (
        <div className="space-y-2">
          <Label htmlFor="fecha">{t('nuevaAlerta.fechaLabel')}</Label>
          <Input
            id="fecha"
            type="date"
            min={fechaMin}
            max={fechaMax}
            value={fecha}
            onChange={(e) => onFecha(e.target.value)}
            aria-describedby="fecha-max-hint"
            required
          />
          <p id="fecha-max-hint" className="text-xs text-muted-foreground">
            {t('nuevaAlerta.fechaMaxHint', { dias: VENTANA_GTFS_DIAS, fecha: fechaMax })}
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="horaDesde">{t('nuevaAlerta.horaDesdeLabel')}</Label>
        <Input
          id="horaDesde"
          type="time"
          value={horaDesde}
          onChange={(e) => onHoraDesde(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="horaHasta">{t('nuevaAlerta.horaHastaLabel')}</Label>
        <Input
          id="horaHasta"
          type="time"
          value={horaHasta}
          onChange={(e) => onHoraHasta(e.target.value)}
        />
      </div>
    </div>
  );
}
