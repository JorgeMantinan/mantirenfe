import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { enlaces, hayAfiliacion } from '@/lib/monetizacion';

export function BloqueBilletes() {
  const { t } = useTranslation();
  if (!hayAfiliacion) return null;

  return (
    <Card className="mx-auto max-w-2xl border-dashed shadow-none">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="font-heading text-base font-semibold">{t('billetes.titulo')}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {enlaces.map((enlace) => (
            <Button key={enlace.id} variant="outline" size="sm" asChild>
              <a href={enlace.url} target="_blank" rel="noopener noreferrer sponsored">
                {t('billetes.enlace', { nombre: enlace.nombre })}
              </a>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('billetes.aviso')}{' '}
          <Link to="/transparencia" className="underline underline-offset-2 hover:text-foreground">
            {t('billetes.transparencia')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
