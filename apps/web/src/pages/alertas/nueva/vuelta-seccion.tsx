import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EstadoFormulario } from './logica';

interface Props {
  estado: Pick<
    EstadoFormulario,
    'tambienVuelta' | 'fechaVuelta' | 'horaDesdeVuelta' | 'horaHastaVuelta'
  >;
  fechaMin: string;
  onTambienVuelta: (activo: boolean) => void;
  onFechaVuelta: (valor: string) => void;
  onHoraDesdeVuelta: (valor: string) => void;
  onHoraHastaVuelta: (valor: string) => void;
}

/** Aviso y campos de la alerta de vuelta, que se crea en la misma tanda. */
export function VueltaSeccion({
  estado,
  fechaMin,
  onTambienVuelta,
  onFechaVuelta,
  onHoraDesdeVuelta,
  onHoraHastaVuelta,
}: Props) {
  const { t } = useTranslation();
  const { tambienVuelta, fechaVuelta, horaDesdeVuelta, horaHastaVuelta } = estado;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <input
          id="tambienVuelta"
          type="checkbox"
          checked={tambienVuelta}
          onChange={(e) => onTambienVuelta(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
        />
        <div className="space-y-1">
          <Label htmlFor="tambienVuelta">{t('nuevaAlerta.tambienVuelta')}</Label>
          <p className="text-xs text-muted-foreground">{t('nuevaAlerta.tambienVueltaDesc')}</p>
          <p className="text-xs text-muted-foreground">{t('nuevaAlerta.tambienVueltaRiesgo')}</p>
        </div>
      </div>
      {tambienVuelta && (
        <div className="space-y-2 pt-2">
          <Label htmlFor="fechaVuelta">{t('nuevaAlerta.fechaVueltaLabel')}</Label>
          <Input
            id="fechaVuelta"
            type="date"
            min={fechaMin}
            value={fechaVuelta}
            onChange={(e) => onFechaVuelta(e.target.value)}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="horaDesdeVuelta">{t('nuevaAlerta.horaDesdeVueltaLabel')}</Label>
              <Input
                id="horaDesdeVuelta"
                type="time"
                value={horaDesdeVuelta}
                onChange={(e) => onHoraDesdeVuelta(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horaHastaVuelta">{t('nuevaAlerta.horaHastaVueltaLabel')}</Label>
              <Input
                id="horaHastaVuelta"
                type="time"
                value={horaHastaVuelta}
                onChange={(e) => onHoraHastaVuelta(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('nuevaAlerta.pistaFranjaVuelta')}</p>
        </div>
      )}
    </div>
  );
}
