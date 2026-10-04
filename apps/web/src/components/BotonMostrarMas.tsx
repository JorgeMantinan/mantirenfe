import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FILAS_POR_PASO_TABLA } from '@/lib/ui-constants';

/**
 * «Mostrar más» de las tablas largas: pinta el botón solo si quedan filas
 * fuera del tope y amplía la ventana visible un paso más.
 */
export function BotonMostrarMas({
  total,
  visible,
  onAmpliar,
}: {
  total: number;
  visible: number;
  onAmpliar: (siguiente: number) => void;
}) {
  const { t } = useTranslation();
  if (total <= visible) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onAmpliar(visible + FILAS_POR_PASO_TABLA)}
      >
        {t('comunes.mostrarMas')}
      </Button>
    </div>
  );
}
