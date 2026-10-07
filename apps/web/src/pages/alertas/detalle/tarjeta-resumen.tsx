import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, BellRing, CalendarPlus, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { locale } from '@/i18n';
import { etiquetaCriterio, etiquetaDiasSemana } from '@/lib/alertas';
import { fechaCorta } from '@/lib/proximoViaje';
import { formatearPrecio } from '@/lib/precios';
import type { AlertaResponse, CriterioAlerta } from '@mantirenfe/shared-types';

interface Props {
  alerta: AlertaResponse;
  onCompartir: () => void;
  onAnadirAlCalendario: () => void;
}

/** Todos los criterios vigilados por la alerta (legada: solo `criterio`). */
function criteriosDe(alerta: AlertaResponse): CriterioAlerta[] {
  return alerta.criterios?.length ? alerta.criterios : [alerta.criterio];
}

/** Cabecera de la alerta: ruta, fechas, badges de estado y acciones. */
export function TarjetaResumen({ alerta, onCompartir, onAnadirAlCalendario }: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
          {alerta.origenNombre} → {alerta.destinoNombre}
        </CardTitle>
        <CardDescription>
          {alerta.fechaFlexible
            ? t('detalleAlerta.rangoFechas', {
                desde: fechaCorta(alerta.fechaDesde ?? alerta.fechaViaje),
                hasta: fechaCorta(alerta.fechaHasta ?? alerta.fechaViaje),
              })
            : alerta.fechaViaje}{' '}
          ·{' '}
          {alerta.horaDesde || alerta.horaHasta
            ? `${alerta.horaDesde ?? '00:00'} – ${alerta.horaHasta ?? '23:59'}`
            : t('comunes.todoElDia')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2 text-sm">
        <Badge
          variant={
            alerta.estado === 'ACTIVA' ? 'exito' : alerta.estado === 'PAUSA' ? 'aviso' : 'secondary'
          }
        >
          {alerta.estado === 'ACTIVA'
            ? t('alertas.estadoActiva')
            : alerta.estado === 'PAUSA'
              ? t('alertas.estadoPausa')
              : t('alertas.completada')}
        </Badge>
        {criteriosDe(alerta).map((c) => (
          <Badge key={c} variant="outline">
            {etiquetaCriterio(t, c)}
          </Badge>
        ))}
        {alerta.conexiones && <Badge variant="aviso">{t('detalleAlerta.conexiones')}</Badge>}
        {criteriosDe(alerta).includes('PRECIO') && alerta.precioObjetivo != null && (
          <Badge variant="aviso">
            {t('alertas.precioObjetivo', {
              precio: formatearPrecio(alerta.precioObjetivo),
            })}
          </Badge>
        )}
        {alerta.fechaFlexible && (
          <Badge variant="aviso">{t('nuevaAlerta.frecuenciaFlexible')}</Badge>
        )}
        {alerta.recurrente && (
          <Badge variant="aviso">{etiquetaDiasSemana(t, alerta.diasSemana)}</Badge>
        )}
        <Badge variant="outline">{t('alertas.cadaMin', { min: alerta.intervaloSondeoMin })}</Badge>
        <Badge variant="outline">{alerta.bono}</Badge>
        {alerta.numeroTren && (
          <Badge variant="outline">
            {t('dashboard.trenNumero', { numero: alerta.numeroTren })}
          </Badge>
        )}
        <span className="text-muted-foreground">
          {t('alertas.ultimoSondeo', {
            fecha: alerta.ultimoSondeoEn
              ? new Date(alerta.ultimoSondeoEn).toLocaleString(locale())
              : t('detalleAlerta.sondeoNinguno'),
          })}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCompartir}>
            <Share2 aria-hidden="true" /> {t('detalleAlerta.compartir')}
          </Button>
          <Button variant="outline" size="sm" onClick={onAnadirAlCalendario}>
            <CalendarPlus aria-hidden="true" /> {t('detalleAlerta.calendario')}
          </Button>
        </div>
        {alerta.grupo && (
          <Link
            to={`/alertas/${alerta.grupo.id}`}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 transition-colors hover:bg-accent"
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="font-medium">{t('alertas.idaVuelta')}</span>
            <Badge variant="outline">
              {alerta.grupoId ? t('alertas.vuelta') : t('alertas.ida')}
            </Badge>
            <span className="min-w-0 truncate text-muted-foreground">
              {alerta.grupo.origenNombre} → {alerta.grupo.destinoNombre} · {alerta.grupo.fechaViaje}
            </span>
          </Link>
        )}
      </CardContent>
      {alerta.notas && (
        <CardContent className="pt-0 text-sm text-muted-foreground">
          {t('detalleAlerta.notas', { texto: alerta.notas })}
        </CardContent>
      )}
    </Card>
  );
}
