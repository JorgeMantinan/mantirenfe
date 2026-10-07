import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { locale } from '@/i18n';
import type { AvisoAlertaResponse } from '@mantirenfe/shared-types';

interface Props {
  avisos: AvisoAlertaResponse[];
}

/** Histórico de avisos que ha dado la alerta, con su badge de «Nuevo». */
export function TarjetaAvisos({ avisos }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('detalleAlerta.avisoTitulo')}</CardTitle>
        <CardDescription>{t('detalleAlerta.avisoDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {avisos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('detalleAlerta.sinAvisos')}</p>
        ) : (
          <ul className="divide-y">
            {avisos.map((aviso) => (
              <li key={aviso.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{aviso.titulo}</p>
                  {!aviso.leida && <Badge variant="destructive">{t('detalleAlerta.nuevo')}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{aviso.cuerpo}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(aviso.creadaEn).toLocaleString(locale())}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
