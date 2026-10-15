import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { horaGtfs, type TrenDisponibilidadResponse } from '@mantirenfe/shared-types';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { estilosTrenes } from '@/components/trenes/estilos';
import { api } from '@/lib/api';
import { formatearPrecio } from '@/lib/precios';
import { useTema } from '@/lib/tema-contexto';

/**
 * Caché en memoria de `GET /trenes/disponibilidad` por `origen|destino|fecha`
 * (mismo patrón que la web): al cerrar y reabrir el panel no se vuelve a
 * consultar la venta. Guarda la PROMESA (single-flight); si rechaza se borra
 * la entrada para que el siguiente intento vuelva a preguntar.
 */
const TTL_MS = 60_000;
const cachePlazas = new Map<
  string,
  { promesa: Promise<TrenDisponibilidadResponse[]>; caduca: number }
>();

function obtenerPlazasPrecio(
  origen: string,
  destino: string,
  fecha: string,
): Promise<TrenDisponibilidadResponse[]> {
  const clave = `${origen}|${destino}|${fecha}`;
  const ahora = Date.now();
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

type EstadoPanel =
  { fase: 'cargando' } | { fase: 'error' } | { fase: 'ok'; trenes: TrenDisponibilidadResponse[] };

/**
 * «Plazas y precio» de una ruta, en formato compacto bajo la fila de
 * horarios: por tren, salida, disponibilidad, precio mínimo y tarifa.
 */
export function PanelPlazasPrecio({
  origen,
  destino,
  fecha,
}: {
  origen: string;
  destino: string;
  fecha: string;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);
  const [estado, setEstado] = useState<EstadoPanel>({ fase: 'cargando' });

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

  return (
    <Tarjeta style={{ marginTop: 6, marginBottom: 6 }}>
      <Text style={s.nombre}>{t('trenes.verPlazas')}</Text>
      {estado.fase === 'cargando' ? <Text style={s.meta}>{t('trenes.plazasCargando')}</Text> : null}
      {estado.fase === 'error' ? (
        <Text style={{ color: paleta.error, fontSize: 13 }}>{t('trenes.plazasError')}</Text>
      ) : null}
      {estado.fase === 'ok' ? (
        estado.trenes.length === 0 ? (
          <Text style={s.meta}>{t('trenes.plazasSinDatos')}</Text>
        ) : (
          estado.trenes.map((tren) => (
            <View
              key={`${tren.numeroTren}-${tren.salida}`}
              style={{
                marginTop: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <Text style={s.nombre}>
                {horaGtfs(tren.salida)} · {tren.numeroTren}
              </Text>
              <Etiqueta tono={tren.cancelado ? 'error' : tren.disponible ? 'exito' : 'neutro'}>
                {tren.cancelado
                  ? t('comunes.cancelado')
                  : tren.disponible
                    ? t('comunes.hayPlazas')
                    : t('comunes.completo')}
              </Etiqueta>
              {tren.precioMin !== null ? (
                <Text style={{ fontSize: 13, fontWeight: '600', color: paleta.aviso }}>
                  {t('detalle.desde', { precio: formatearPrecio(tren.precioMin) })}
                  {tren.tarifa ? ` · ${tren.tarifa}` : ''}
                </Text>
              ) : null}
            </View>
          ))
        )
      ) : null}
    </Tarjeta>
  );
}
