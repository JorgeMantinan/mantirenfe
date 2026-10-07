import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EstadoFormulario } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'frecuencia' | 'fecha' | 'horaDesde' | 'horaHasta'>;
  /** Fecha mínima aceptada por el input (hoy). */
  fechaMin: string;
  onFecha: (valor: string) => void;
  onHoraDesde: (valor: string) => void;
  onHoraHasta: (valor: string) => void;
}

/** Fecha concreta (solo con frecuencia "fecha") y franja horaria de la ida. */
export function FranjaSeccion({ estado, fechaMin, onFecha, onHoraDesde, onHoraHasta }: Props) {
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
            value={fecha}
            onChange={(e) => onFecha(e.target.value)}
            required
          />
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
