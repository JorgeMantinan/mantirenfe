import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { horaGtfs, type HorarioTrenResponse } from '@mantirenfe/shared-types';
import type { EstadoFormulario } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'numeroTren'>;
  onNumeroTren: (valor: string) => void;
  /** Próximas salidas de la ruta, para elegir sin escribir el número. */
  trenesSugeridos: HorarioTrenResponse[];
}

/** Número de tren a vigilar con los atajos de las próximas salidas. */
export function TrenSeccion({ estado, onNumeroTren, trenesSugeridos }: Props) {
  const { t } = useTranslation();
  const { numeroTren } = estado;
  return (
    <div className="space-y-2">
      <Label htmlFor="numeroTren">{t('nuevaAlerta.trenLabel')}</Label>
      <Input
        id="numeroTren"
        value={numeroTren}
        onChange={(e) => onNumeroTren(e.target.value)}
        placeholder={t('nuevaAlerta.trenPlaceholder')}
        maxLength={20}
      />
      {trenesSugeridos.length > 0 && !numeroTren.trim() && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('nuevaAlerta.proximos')}</span>
          {trenesSugeridos.map((t) => (
            <Button
              key={`${t.numeroTren}-${t.salida}`}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onNumeroTren(t.numeroTren)}
            >
              {horaGtfs(t.salida)} · {t.numeroTren}
              {t.operador ? ` · ${t.operador}` : ''}
            </Button>
          ))}
        </div>
      )}
      {trenesSugeridos.length > 0 && !numeroTren.trim() && (
        <p className="text-xs text-muted-foreground">{t('nuevaAlerta.elegirProximo')}</p>
      )}
    </div>
  );
}
