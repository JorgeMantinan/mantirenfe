import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { api } from '@/lib/api';
import { formatoPeriodo, type IncidenciaResponse } from '@/lib/incidencias';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

export default function Incidencias() {
  const [datos, setDatos] = useState<IncidenciaResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const cargar = useCallback(() => {
    setCargando(true);
    api<IncidenciaResponse[]>('/incidencias')
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        setDatos([]);
      })
      .finally(() => setCargando(false));
  }, []);

  // Carga al montar + pull-to-refresh (en la web refresca cada 60 s; aquí basta
  // con recargar al volver o palear)
  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <View style={s.pantalla}>
      <FlatList
        data={datos ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} />}
        contentContainerStyle={s.lista}
        ListHeaderComponent={
          <View style={s.intro}>
            <Text style={s.titulo}>{t('incidencias.titulo')}</Text>
            <Text style={s.subtitulo}>{t('incidencias.subtitulo')}</Text>
          </View>
        }
        ListEmptyComponent={
          cargando && datos === null ? (
            <ActivityIndicator color={paleta.primario} style={{ marginTop: espaciado.xl }} />
          ) : error ? null : (
            <Tarjeta>
              <Text style={s.vacioTitulo}>{t('incidencias.vacioTitulo')}</Text>
              <Text style={s.vacioTexto}>{t('incidencias.vacioTexto')}</Text>
            </Tarjeta>
          )
        }
        ListFooterComponent={
          error ? (
            <Tarjeta style={{ borderColor: paleta.error }}>
              <Text style={{ color: paleta.error }}>{error}</Text>
            </Tarjeta>
          ) : null
        }
        renderItem={({ item }) => (
          <Tarjeta style={{ borderColor: paleta.aviso }}>
            <View style={s.filaTitulo}>
              <Ionicons name="warning-outline" size={20} color={paleta.aviso} />
              <Text style={s.tituloIncidencia}>
                {item.titulo ?? t('incidencias.fallbackTitulo')}
              </Text>
            </View>
            <Text style={s.periodo}>{formatoPeriodo(item.desde, item.hasta)}</Text>
            <View style={s.badges}>
              {item.estacionesAfectadas.length > 0 ? (
                item.estacionesAfectadas.map((estacion) => (
                  <Etiqueta key={estacion} tono="aviso">
                    {estacion}
                  </Etiqueta>
                ))
              ) : (
                <Text style={s.meta}>{t('incidencias.sinEstacion')}</Text>
              )}
              {item.causa ? <Etiqueta tono="primario">{item.causa}</Etiqueta> : null}
            </View>
            {item.mensaje ? <Text style={s.mensaje}>{item.mensaje}</Text> : null}
          </Tarjeta>
        )}
      />
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondoSecundario,
    },
    lista: {
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    intro: {
      marginBottom: espaciado.sm,
      gap: 2,
    },
    titulo: {
      fontSize: 20,
      fontWeight: '800',
      color: c.texto,
    },
    subtitulo: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    filaTitulo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaciado.sm,
    },
    tituloIncidencia: {
      flex: 1,
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
    },
    periodo: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: espaciado.sm,
    },
    meta: {
      fontSize: 13,
      color: c.textoSecundario,
    },
    mensaje: {
      fontSize: 14,
      color: c.textoSecundario,
      lineHeight: 20,
    },
    vacioTitulo: {
      fontSize: 16,
      fontWeight: '700',
      color: c.texto,
      textAlign: 'center',
    },
    vacioTexto: {
      fontSize: 13,
      color: c.textoSecundario,
      textAlign: 'center',
    },
  });
