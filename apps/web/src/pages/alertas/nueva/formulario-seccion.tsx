import type { FormEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  onSubmit: (event: FormEvent) => void;
  /** Guardando en la API: el botón se deshabilita y muestra "Guardando…". */
  enviando: boolean;
  /** true = modo edición (el botón dice "Guardar cambios"). */
  editando: boolean;
  children: ReactNode;
}

/** Tarjeta con su cabecera que envuelve el formulario completo de la alerta. */
export function FormularioSeccion({ onSubmit, enviando, editando, children }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
          {t('nuevaAlerta.trayectoTitulo')}
        </CardTitle>
        <CardDescription>{t('nuevaAlerta.trayectoDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          {children}
          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando
              ? t('nuevaAlerta.guardando')
              : editando
                ? t('nuevaAlerta.guardarCambios')
                : t('nuevaAlerta.crearYVigilar')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
