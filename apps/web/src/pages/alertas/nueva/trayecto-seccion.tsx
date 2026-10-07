import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EstacionResponse } from '@mantirenfe/shared-types';
import type { EstadoFormulario } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'origen' | 'destino'>;
  onOrigen: (valor: string) => void;
  onDestino: (valor: string) => void;
  sugerenciasOrigen: EstacionResponse[];
  sugerenciasDestino: EstacionResponse[];
}

/** Extremos del trayecto con su autocompletado de estaciones (dos listas). */
export function TrayectoSeccion({
  estado,
  onOrigen,
  onDestino,
  sugerenciasOrigen,
  sugerenciasDestino,
}: Props) {
  const { t } = useTranslation();
  const { origen, destino } = estado;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="origen">{t('trayectos.etiquetaOrigen')}</Label>
          <Input
            id="origen"
            list="estaciones-origen"
            value={origen}
            onChange={(e) => onOrigen(e.target.value)}
            placeholder="Madrid-Atocha"
            required
            minLength={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="destino">{t('trayectos.etiquetaDestino')}</Label>
          <Input
            id="destino"
            list="estaciones-destino"
            value={destino}
            onChange={(e) => onDestino(e.target.value)}
            placeholder="Barcelona-Sants"
            required
            minLength={2}
          />
        </div>
      </div>
      <datalist id="estaciones-origen">
        {sugerenciasOrigen.map((e) => (
          <option key={e.id} value={e.nombre}>
            {e.ciudad}
          </option>
        ))}
      </datalist>
      <datalist id="estaciones-destino">
        {sugerenciasDestino.map((e) => (
          <option key={e.id} value={e.nombre}>
            {e.ciudad}
          </option>
        ))}
      </datalist>
    </>
  );
}
