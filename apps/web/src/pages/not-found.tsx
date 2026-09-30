import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export function PaginaNoEncontrada() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-heading text-6xl font-bold text-primary">404</p>
      <h1 className="font-heading text-2xl font-semibold">{t('noEncontrado.titulo')}</h1>
      <p className="max-w-md text-muted-foreground">{t('noEncontrado.texto')}</p>
      <Button asChild>
        <Link to="/">{t('comunes.volverInicio')}</Link>
      </Button>
    </div>
  );
}
