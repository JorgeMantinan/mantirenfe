import { memo, useMemo } from 'react';
import { router } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  esOuigo,
  horaGtfs,
  type HorarioTrenResponse,
  type MotivoHorarios,
} from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { estilosTrenes } from '@/components/trenes/estilos';
import { useTema } from '@/lib/tema-contexto';
import { espaciado } from '@/lib/tema';

export type FranjaSalida = 'todo' | 'manana' | 'tarde' | 'noche';

/**
 * Chips de franja de salida para el modo horarios: [desde, hasta) para que
 * las horas de frontera (12:00, 20:00) no cuenten dos veces. «Noche» llega
 * hasta 24:00, que en HH:MM incluye las 23:59.
 */
const FRANJAS_SALIDA: Array<{
  id: FranjaSalida;
  desde: string | null;
  hasta: string | null;
}> = [
  { id: 'todo', desde: null, hasta: null },
  { id: 'manana', desde: '06:00', hasta: '12:00' },
  { id: 'tarde', desde: '12:00', hasta: '20:00' },
  { id: 'noche', desde: '20:00', hasta: '24:00' },
];

type HorariosVistaProps = {
  /** ¿Sigue pidiendo horarios? (RefreshControl del listado) */
  cargando: boolean;
  horarios: HorarioTrenResponse[] | null;
  errorHorarios: string | null;
  /** Motivo de una respuesta vacía: estación inexistente vs. sin trenes */
  motivoHorarios: MotivoHorarios | null;
  sinEstacion: string[];
  franjaSalida: FranjaSalida;
  onFranjaSalida: (franja: FranjaSalida) => void;
  origen: string;
  destino: string;
  fecha: string;
  onCrearAlerta: (numeroTren: string) => void;
  onRefrescar: () => void;
};

export function HorariosVista({
  cargando,
  horarios,
  errorHorarios,
  motivoHorarios,
  sinEstacion,
  franjaSalida,
  onFranjaSalida,
  origen,
  destino,
  fecha,
  onCrearAlerta,
  onRefrescar,
}: HorariosVistaProps) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);

  const etiquetasFranja: Record<FranjaSalida, string> = {
    todo: t('trenes.franja.todo'),
    manana: t('trenes.franja.manana'),
    tarde: t('trenes.franja.tarde'),
    noche: t('trenes.franja.noche'),
  };

  // `horaGtfs` devuelve «HH:MM», así que comparar strings es comparar horas.
  const horariosVisibles = useMemo(() => {
    const lista = horarios ?? [];
    const franja = FRANJAS_SALIDA.find((f) => f.id === franjaSalida);
    if (!franja) return lista;
    const { desde, hasta } = franja;
    if (!desde || !hasta) return lista;
    return lista.filter((t) => {
      const salida = horaGtfs(t.salida);
      return /^\d{2}:\d{2}$/.test(salida) && salida >= desde && salida < hasta;
    });
  }, [horarios, franjaSalida]);

  return (
    <FlatList
      data={horariosVisibles}
      keyExtractor={(item, index) => `${item.numeroTren}-${item.salida}-${index}`}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => onRefrescar()} />}
      contentContainerStyle={s.lista}
      ListHeaderComponent={
        errorHorarios ? (
          <Tarjeta style={{ borderColor: paleta.error }}>
            <Text style={{ color: paleta.error }}>{errorHorarios}</Text>
          </Tarjeta>
        ) : horarios && horarios.length === 0 ? (
          <Tarjeta>
            <Text style={s.nombre}>
              {motivoHorarios === 'estaciones'
                ? t('trenes.estacionNoEncontrada')
                : t('trenes.sinTrenesRuta')}
            </Text>
            <Text style={[s.meta, { marginTop: 4 }]}>
              {motivoHorarios === 'estaciones'
                ? t('trenes.noEncontramos', {
                    lista:
                      sinEstacion.length > 0
                        ? sinEstacion.map((n) => `«${n}»`).join(t('comunes.y'))
                        : t('trenes.indicada'),
                  })
                : t('trenes.sinDirectos', { origen, destino, fecha })}
            </Text>
            {motivoHorarios === 'estaciones' ? null : (
              <Boton
                titulo={t('trenes.crearAlerta')}
                onPress={() =>
                  router.push({
                    pathname: '/alertas/nueva',
                    params: { origen, destino, fecha },
                  })
                }
                style={{ marginTop: 10, alignSelf: 'flex-start' }}
              />
            )}
          </Tarjeta>
        ) : horarios && horarios.length > 0 ? (
          <View style={{ gap: espaciado.sm, marginBottom: espaciado.sm }}>
            <View style={s.modos}>
              {FRANJAS_SALIDA.map((f) => (
                <Text
                  key={f.id}
                  style={[s.modo, franjaSalida === f.id && s.modoActivo]}
                  onPress={() => onFranjaSalida(f.id)}
                  suppressHighlighting
                >
                  {etiquetasFranja[f.id]}
                </Text>
              ))}
            </View>
            <Text style={s.meta}>
              {t('trenes.mostrando', {
                visibles: horariosVisibles.length,
                total: horarios.length,
              })}
            </Text>
            {horariosVisibles.length === 0 ? (
              <Tarjeta>
                <Text style={s.nombre}>{t('trenes.sinSalidasFranja')}</Text>
                <Text style={[s.meta, { marginTop: 4 }]}>
                  {t('trenes.pruebaFranja', { todo: etiquetasFranja.todo })}
                </Text>
              </Tarjeta>
            ) : null}
          </View>
        ) : null
      }
      initialNumToRender={8}
      renderItem={({ item }) => (
        <FilaHorario
          horario={item}
          origen={origen}
          destino={destino}
          fecha={fecha}
          onCrearAlerta={onCrearAlerta}
        />
      )}
    />
  );
}

/**
 * Fila de horarios con `React.memo`: al refrescar o cambiar la franja solo se
 * repinta lo que ha cambiado de verdad (los datos de cada fila son estables).
 */
const FilaHorario = memo(function FilaHorario({
  horario,
  origen,
  destino,
  fecha,
  onCrearAlerta,
}: {
  horario: HorarioTrenResponse;
  origen: string;
  destino: string;
  fecha: string;
  onCrearAlerta: (numeroTren: string) => void;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosTrenes(paleta), [paleta]);
  return (
    <Tarjeta>
      <View style={s.fila}>
        <Text style={s.nombre}>{horario.numeroTren}</Text>
        <Etiqueta tono="primario">{horario.duracionMin} min</Etiqueta>
      </View>
      <Text style={s.meta}>
        {horaGtfs(horario.salida)}
        {' → '}
        {horaGtfs(horario.llegada)}
        {' · '}
        {horario.origenNombre} → {horario.destinoNombre}
      </Text>
      {horario.operador ? (
        esOuigo(horario.operador) ? (
          <Etiqueta tono="aviso">{horario.operador}</Etiqueta>
        ) : (
          <Text style={s.meta}>{horario.operador}</Text>
        )
      ) : null}
      {horario.transbordo ? (
        <View style={{ marginTop: 4, gap: 2 }}>
          <Etiqueta tono="primario">
            {t('trenes.transbordo', { estacion: horario.transbordo.estacion })}
          </Etiqueta>
          <Text style={s.meta}>
            {t('trenes.transbordoDetalle', {
              tren1: horario.transbordo.trenPrimera,
              hora1: horaGtfs(horario.transbordo.llegadaPrimera),
              espera: horario.transbordo.esperaMin,
              tren2: horario.transbordo.trenSegunda,
              hora2: horaGtfs(horario.transbordo.salidaSegunda),
            })}
          </Text>
        </View>
      ) : null}
      <Boton
        titulo={t('trenes.masAlerta')}
        variante="contorno"
        onPress={() => onCrearAlerta(horario.transbordo ? '' : horario.numeroTren)}
        style={{ marginTop: 8, alignSelf: 'flex-start' }}
      />
    </Tarjeta>
  );
});
