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
import { PanelPlazasPrecio } from '@/components/trenes/PanelPlazasPrecio';
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
  /** Rango propio (HH:MM) del formulario: si tiene valores, manda sobre los chips. */
  rangoCustom?: { desde: string; hasta: string };
  onQuitarRango?: () => void;
  /** Fila con el panel «Plazas y precio» desplegado (clave única; null = ninguna). */
  plazasFila: string | null;
  onPlazasFila: (clave: string | null) => void;
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
  rangoCustom,
  onQuitarRango,
  plazasFila,
  onPlazasFila,
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

  // El rango escrito en el formulario (desde/hasta con reloj) manda sobre los
  // chips: es lo que llega de /estaciones y lo que el usuario pidió a mano.
  const rangoActivo = rangoCustom && (rangoCustom.desde || rangoCustom.hasta) ? rangoCustom : null;

  // `horaGtfs` devuelve «HH:MM», así que comparar strings es comparar horas.
  const horariosVisibles = useMemo(() => {
    const lista = horarios ?? [];
    if (rangoActivo) {
      const { desde, hasta } = rangoActivo;
      return lista.filter((t) => {
        const salida = horaGtfs(t.salida);
        if (!/^\d{2}:\d{2}$/.test(salida)) return false;
        if (desde && salida < desde) return false;
        if (hasta && salida > hasta) return false;
        return true;
      });
    }
    const franja = FRANJAS_SALIDA.find((f) => f.id === franjaSalida);
    if (!franja) return lista;
    const { desde, hasta } = franja;
    if (!desde || !hasta) return lista;
    return lista.filter((t) => {
      const salida = horaGtfs(t.salida);
      return /^\d{2}:\d{2}$/.test(salida) && salida >= desde && salida < hasta;
    });
  }, [horarios, franjaSalida, rangoActivo]);

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
            {rangoActivo ? (
              <View style={s.modos}>
                <Text style={[s.modo, s.modoActivo]} suppressHighlighting>
                  {t('trenes.rangoPersonalizado', {
                    desde: rangoActivo.desde || '00:00',
                    hasta: rangoActivo.hasta || '23:59',
                  })}
                </Text>
                {onQuitarRango ? (
                  <Text style={s.modo} onPress={onQuitarRango} suppressHighlighting>
                    {t('trenes.rangoQuitar')}
                  </Text>
                ) : null}
              </View>
            ) : (
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
            )}
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
      renderItem={({ item }) => {
        const clave = `${item.numeroTren}-${item.salida}`;
        const plazasAbiertas = plazasFila === clave;
        return (
          <>
            <FilaHorario
              horario={item}
              origen={origen}
              destino={destino}
              fecha={fecha}
              onCrearAlerta={onCrearAlerta}
              onPlazas={() => onPlazasFila(plazasAbiertas ? null : clave)}
            />
            {plazasAbiertas ? (
              <PanelPlazasPrecio
                origen={item.origenNombre || origen}
                destino={item.destinoNombre || destino}
                fecha={fecha}
              />
            ) : null}
          </>
        );
      }}
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
  onPlazas,
}: {
  horario: HorarioTrenResponse;
  origen: string;
  destino: string;
  fecha: string;
  onCrearAlerta: (numeroTren: string) => void;
  onPlazas: () => void;
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <Boton titulo={t('trenes.verPlazas')} variante="contorno" onPress={onPlazas} />
        <Boton
          titulo={t('trenes.masAlerta')}
          variante="contorno"
          onPress={() => onCrearAlerta(horario.transbordo ? '' : horario.numeroTren)}
        />
      </View>
    </Tarjeta>
  );
});
