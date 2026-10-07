import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EstadoFormulario } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'notas'>;
  onNotas: (valor: string) => void;
}

/** Notas libres de la alerta (máximo 500 caracteres). */
export function NotasSeccion({ estado, onNotas }: Props) {
  const { t } = useTranslation();
  const { notas } = estado;
  return (
    <div className="space-y-2">
      <Label htmlFor="notas">{t('nuevaAlerta.notasLabel')}</Label>
      <Textarea
        id="notas"
        value={notas}
        onChange={(e) => onNotas(e.target.value)}
        placeholder={t('nuevaAlerta.notasPlaceholder')}
        maxLength={500}
      />
    </div>
  );
}
