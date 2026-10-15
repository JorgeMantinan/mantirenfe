import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { BellPlus, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { formatearPrecio } from '@/lib/precios';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { horaGtfs, type TrenDisponibilidadResponse } from '@mantirenfe/shared-types';

/**
 * Caché en memoria de `GET /trenes/disponibilidad` por clave
 * `origen|destino|fecha` (el origen se incluye porque la estación seleccionada
 * puede cambiar y el destino es el mismo): al cerrar y reabrir el panel de una
 * fila no se vuelve a consultar la venta. Guarda la PROMESA, no el valor, de
 * modo que dos paneles simultáneos de la misma ruta comparten un único fetch
 * (single-flight); si rechaza se borra la entrada para que el siguiente
 * intento vuelva a preguntar (los errores no se cachean).
 */
const TTL_MS = 60_000;
const cachePlazas = new Map<
  string,
  { promesa: Promise<TrenDisponibilidadResponse[]>; caduca: number }
>();

export function clavePlazasPrecio(origen: string, destino: string, fecha: string): string {
  return `${origen}|${destino}|${fecha}`;
}

export function obtenerPlazasPrecio(
  origen: string,
  destino: string,
  fecha: string,
  forzar = false,
): Promise<TrenDisponibilidadResponse[]> {
  const clave = clavePlazasPrecio(origen, destino, fecha);
  const ahora = Date.now();
  if (forzar) cachePlazas.delete(clave);
  const previa = cachePlazas.get(clave);
  if (previa && previa.caduca > ahora) return previa.promesa;

  const promesa = api<TrenDisponibilidadResponse[]>(
    `/trenes/disponibilidad?origen=${encodeURIComponent(origen)}` +
      `&destino=${encodeURIComponent(destino)}&fecha=${encodeURIComponent(fecha)}`,
  ).then((trenes) => {
    // Podar entradas caducadas para que el Map no crezca sin límite
    if (cachePlazas.size > 100) {
      for (const [k, v] of cachePlazas) {
        if (v.caduca <= Date.now()) cachePlazas.delete(k);
      }
    }
    return trenes;
  });
  cachePlazas.set(clave, { promesa, caduca: ahora + TTL_MS });
  promesa.catch(() => {
    if (cachePlazas.get(clave)?.promesa === promesa) cachePlazas.delete(clave);
  });
  return promesa;
}

interface PanelPlazasPrecioProps {
  origen: string;
  destino: string;
  fecha: string;
}

type EstadoPanel =
  { fase: 'cargando' } | { fase: 'error' } | { fase: 'ok'; trenes: TrenDisponibilidadResponse[] };

/**
 * Resultado de «Plazas y precio» para una ruta: por tren, número, salida,
 * llegada, disponibilidad, precio mínimo, tarifa y si está cancelado. Se
 * despliega bajo la fila de la salidas (una `<tr>` con colSpan en la tabla).
 */
export function PanelPlazasPrecio({ origen, destino, fecha }: PanelPlazasPrecioProps) {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<EstadoPanel>({ fase: 'cargando' });
  const [actualizando, setActualizando] = useState(false);

  const recargar = () => {
    setActualizando(true);
    obtenerPlazasPrecio(origen, destino, fecha, true)
      .then((trenes) => setEstado({ fase: 'ok', trenes }))
      .catch(() => setEstado({ fase: 'error' }))
      .finally(() => setActualizando(false));
  };

  useEffect(() => {
    let vivo = true;
    setEstado({ fase: 'cargando' });
    obtenerPlazasPrecio(origen, destino, fecha)
      .then((trenes) => {
        if (vivo) setEstado({ fase: 'ok', trenes });
      })
      .catch(() => {
        if (vivo) setEstado({ fase: 'error' });
      });
    return () => {
      vivo = false;
    };
  }, [origen, destino, fecha]);

  const rutaAlerta =
    `/alertas/nueva?origen=${encodeURIComponent(origen)}` +
    `&destino=${encodeURIComponent(destino)}&fecha=${fecha}`;

  return (
    <div className="space-y-2 p-2" data-testid="panel-plazas-precio">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={recargar} disabled={actualizando}>
          <RefreshCw
            className={`h-4 w-4 ${actualizando ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {t('estaciones.actualizar')}
        </Button>
      </div>
      {estado.fase === 'cargando' ? (
        <div aria-live="polite" className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <p className="text-xs text-muted-foreground">{t('estaciones.cargandoPlazas')}</p>
        </div>
      ) : null}

      {estado.fase === 'error' ? (
        <p className="text-sm text-destructive">{t('estaciones.errorPlazas')}</p>
      ) : null}

      {estado.fase === 'ok' ? (
        <>
          {estado.trenes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('estaciones.sinDatosPrecio')}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pl-3 pr-3 font-medium">{t('tabla.tren')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('tabla.salida')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('tabla.llegada')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('estaciones.colPlazas')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('estaciones.colPrecio')}</th>
                    <th className="py-1.5 pr-3 font-medium">{t('estaciones.colTarifa')}</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.trenes.map((tren) => (
                    <tr
                      key={`${tren.numeroTren}-${tren.salida}`}
                      className="border-b last:border-b-0 even:bg-muted/40"
                    >
                      <td className="py-1.5 pl-3 pr-3 whitespace-nowrap">{tren.numeroTren}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                        {horaGtfs(tren.salida)}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                        {tren.llegada ? horaGtfs(tren.llegada) : '—'}
                      </td>
                      <td className="py-1.5 pr-3">
                        {tren.cancelado ? (
                          <span className="font-medium text-destructive">
                            {t('estados.cancelado')}
                          </span>
                        ) : tren.disponible ? (
                          t('estaciones.plazasSi')
                        ) : (
                          <span className="text-muted-foreground">{t('estaciones.plazasNo')}</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                        {formatearPrecio(tren.precioMin)}
                      </td>
                      <td className="py-1.5 pr-3">
                        {tren.tarifa ?? <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to={rutaAlerta}>
              <BellPlus className="h-4 w-4" aria-hidden="true" />
              {t('estaciones.crearAlertaDestino', { destino })}
            </Link>
          </Button>
        </>
      ) : null}
    </div>
  );
}
