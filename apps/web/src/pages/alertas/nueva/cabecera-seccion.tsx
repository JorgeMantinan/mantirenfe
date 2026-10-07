import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** true = se está editando una alerta existente (títulos de edición). */
  editando: boolean;
  onVolver: () => void;
}

/** Cabecera de la página: botón de volver y título según el modo. */
export function CabeceraSeccion({ editando, onVolver }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <Button variant="ghost" size="sm" onClick={onVolver} className="-ml-2">
        <ArrowLeft aria-hidden="true" /> {t('nuevaAlerta.volver')}
      </Button>
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {editando ? t('nuevaAlerta.editarTitulo') : t('nuevaAlerta.nuevaTitulo')}
      </h1>
      <p className="text-muted-foreground">
        {editando ? t('nuevaAlerta.editarSub') : t('nuevaAlerta.nuevaSub')}
      </p>
    </div>
  );
}
