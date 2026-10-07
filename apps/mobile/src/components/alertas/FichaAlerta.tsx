import { useMemo } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AlertaResponse, CriterioAlerta } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { estilosDetalle } from '@/components/alertas/estilos';
import { locale } from '@/i18n';
import { etiquetaCriterio, etiquetaDiasSemana, etiquetaEstado } from '@/lib/alertas';
import { fechaCorta } from '@/lib/proximoViaje';
import { formatearPrecio } from '@/lib/precios';
import { useTema } from '@/lib/tema-contexto';

/** Todos los criterios vigilados por la alerta (legada: solo `criterio`). */
function criteriosDe(alerta: AlertaResponse): CriterioAlerta[] {
  return alerta.criterios?.length ? alerta.criterios : [alerta.criterio];
}

type Props = {
  alerta: AlertaResponse;
  onCompartir: () => void;
  onCalendario: () => void;
};

/** Ficha de la alerta: ruta, etiquetas de estado, detalle y acciones. */
export function FichaAlerta({ alerta, onCompartir, onCalendario }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosDetalle(paleta), [paleta]);

  /** El otro tramo del grupo ida/vuelta (si esta alerta forma pareja). */
  const grupo = alerta.grupo;
  /** El ancla (sin `grupoId`) es la ida: así esta alerta sabe qué tramo es. */
  const esVuelta = Boolean(alerta.grupoId);

  return (
    <Tarjeta>
      <View style={s.fila}>
        <Text style={s.ruta}>
          {alerta.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
          {alerta.destinoNombre}
        </Text>
        <View style={s.etiquetas}>
          <Etiqueta
            tono={
              alerta.estado === 'ACTIVA' ? 'exito' : alerta.estado === 'PAUSA' ? 'aviso' : 'neutro'
            }
          >
            {etiquetaEstado(alerta.estado)}
          </Etiqueta>
          {criteriosDe(alerta).map((c) => (
            <Etiqueta key={c} tono="neutro">
              {etiquetaCriterio(c)}
            </Etiqueta>
          ))}
          {alerta.conexiones ? (
            <Etiqueta tono="primario">{t('detalle.conexiones')}</Etiqueta>
          ) : null}
          {alerta.fechaFlexible ? (
            <Etiqueta tono="primario">{t('nueva.frecuencia.flexible')}</Etiqueta>
          ) : null}
          {alerta.recurrente ? (
            <Etiqueta tono="primario">{etiquetaDiasSemana(alerta.diasSemana)}</Etiqueta>
          ) : null}
        </View>
      </View>
      <Text style={s.detalle}>
        {t('detalle.metaAlerta', {
          fecha: alerta.fechaFlexible
            ? t('detalle.rangoFechas', {
                desde: fechaCorta(alerta.fechaDesde ?? alerta.fechaViaje),
                hasta: fechaCorta(alerta.fechaHasta ?? alerta.fechaViaje),
              })
            : alerta.fechaViaje,
          min: alerta.intervaloSondeoMin,
          bono: alerta.bono,
        })}
      </Text>
      {criteriosDe(alerta).includes('PRECIO') && alerta.precioObjetivo != null ? (
        <Text style={s.detalle}>
          {t('detalle.objetivo', { precio: formatearPrecio(alerta.precioObjetivo) })}
        </Text>
      ) : null}
      {alerta.horaDesde || alerta.horaHasta ? (
        <Text style={s.detalle}>
          {t('detalle.franja', {
            desde: alerta.horaDesde ?? '00:00',
            hasta: alerta.horaHasta ?? '23:59',
          })}
          {alerta.numeroTren ? t('detalle.trenSufijo', { tren: alerta.numeroTren }) : ''}
        </Text>
      ) : alerta.numeroTren ? (
        <Text style={s.detalle}>{t('detalle.tren', { tren: alerta.numeroTren })}</Text>
      ) : null}
      <Text style={s.detalle}>
        {t('detalle.ultimoSondeo', {
          valor: alerta.ultimoSondeoEn
            ? new Date(alerta.ultimoSondeoEn).toLocaleString(locale())
            : t('detalle.ninguno'),
        })}
      </Text>
      {grupo ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('alertas.idaVuelta')}
          onPress={() => router.push(`/alertas/${grupo.id}`)}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        >
          <View style={s.grupo}>
            <View style={s.grupoEtiquetas}>
              <Etiqueta tono="primario">{t('alertas.idaVuelta')}</Etiqueta>
              <Etiqueta tono="neutro">{esVuelta ? t('alertas.vuelta') : t('alertas.ida')}</Etiqueta>
            </View>
            <Text style={s.detalle}>
              {grupo.origenNombre} <Text style={{ color: paleta.primario }}>→</Text>{' '}
              {grupo.destinoNombre} · {grupo.fechaViaje}
            </Text>
          </View>
        </Pressable>
      ) : null}
      <View style={s.acciones}>
        <Boton
          titulo={t('comunes.compartir')}
          variante="contorno"
          onPress={onCompartir}
          style={s.compartir}
        />
        <Boton
          titulo={t('detalle.calendarioTitulo')}
          variante="contorno"
          onPress={onCalendario}
          style={s.compartir}
        />
      </View>
    </Tarjeta>
  );
}
