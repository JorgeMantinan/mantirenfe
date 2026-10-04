import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Tarjeta } from '@/components/Tarjeta';
import { useAuth } from '@/hooks/useAuth';
import { cambiarIdioma, IDIOMAS, type Idioma } from '@/i18n';
import { api } from '@/lib/api';
import {
  desregistrarPushMovil,
  leerPermisoPush,
  registrarPushMovil,
  type EstadoPermisoPush,
} from '@/lib/push';
import { useTema, type ModoTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';
import { repintarWidget } from '@/widget/actualizarWidget';

const MODOS_TEMA: readonly ModoTema[] = ['claro', 'oscuro', 'sistema'];

const MINUTOS_RECORDATORIO = [15, 30, 50, 60, 90, 120, 180] as const;

export default function Ajustes() {
  const { user, salir, authConfigurada } = useAuth();
  const { modo, setModo, paleta } = useTema();
  const { t, i18n } = useTranslation();
  const [pref, setPref] = useState<PreferenciasUsuario | null>(null);
  const [push, setPush] = useState(true);
  const [recordatorio, setRecordatorio] = useState(true);
  const [minutos, setMinutos] = useState(50);
  const [resumen, setResumen] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [estadoPush, setEstadoPush] = useState<string | null>(null);
  // Estado real del permiso del sistema: manda sobre el interruptor, que no
  // debe enseñar «activado» con las notificaciones bloqueadas por Android.
  const [permiso, setPermiso] = useState<EstadoPermisoPush | null>(null);
  const s = useMemo(() => estilos(paleta), [paleta]);

  const idiomaActual: Idioma = i18n.language === 'en' ? 'en' : 'es';
  const etiquetasModo: Record<ModoTema, string> = {
    claro: t('ajustes.temaClaro'),
    oscuro: t('ajustes.temaOscuro'),
    sistema: t('ajustes.temaSistema'),
  };

  // `cancelado` evita que la respuesta pinte preferencias de una pantalla ya
  // desmontada (o pisar las de una recarga posterior).
  const cancelado = useRef(false);
  const peticion = useRef(0);

  useEffect(() => {
    if (!authConfigurada) return;
    cancelado.current = false;
    const id = ++peticion.current;
    api<PreferenciasUsuario>('/auth/preferencias')
      .then((p) => {
        if (cancelado.current || peticion.current !== id) return;
        setPref(p);
        setPush(p.notificacionesPush);
        setRecordatorio(p.recordatorioSalida);
        setMinutos(p.minutosRecordatorio ?? 50);
        setResumen(p.resumenViaje);
      })
      .catch(() => {
        // sin preferencias guardadas: se mantienen los valores por defecto
      });
    return () => {
      cancelado.current = true;
      peticion.current++;
    };
  }, [authConfigurada]);

  // Permiso de notificaciones al montar (y se vuelve a leer tras cada intento)
  useEffect(() => {
    let vivo = true;
    void leerPermisoPush().then((estado) => {
      if (vivo) setPermiso(estado);
    });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Guarda las preferencias en el servidor y devuelve si ha salido bien.
   * No hace el POST hasta haber cargado `pref` (si el GET falló o sigue en
   * vuelo, no hay con qué construir el cuerpo) ni si el propio POST falla.
   */
  const guardar = async (parcial: Partial<PreferenciasUsuario>): Promise<boolean> => {
    if (!pref) return false;
    setGuardando(true);
    try {
      const siguiente: PreferenciasUsuario = {
        notificacionesPush: parcial.notificacionesPush ?? pref.notificacionesPush,
        notificacionesEmail: parcial.notificacionesEmail ?? pref.notificacionesEmail,
        recordatorioSalida: parcial.recordatorioSalida ?? pref.recordatorioSalida,
        resumenViaje: parcial.resumenViaje ?? pref.resumenViaje,
        minutosRecordatorio: parcial.minutosRecordatorio ?? pref.minutosRecordatorio,
        tema: modo,
      };
      const guardado = await api<PreferenciasUsuario>('/auth/preferencias', {
        method: 'POST',
        json: siguiente,
      });
      setPref(guardado);
      return true;
    } catch {
      // preferencias opcionales: no bloquean la UI; quien llama revierte
      return false;
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Aplica el cambio en pantalla y, si no se ha guardado, lo deshace y avisa:
   * la interfaz no debe enseñar un estado que el servidor no tiene.
   */
  const guardarConReversion = async (
    aplicar: () => void,
    revertir: () => void,
    parcial: Partial<PreferenciasUsuario>,
  ): Promise<void> => {
    aplicar();
    if (await guardar(parcial)) return;
    revertir();
    Alert.alert(t('comunes.error'), t('comunes.errorActualizar'));
  };

  const cambiarPush = async (activo: boolean) => {
    const anterior = push;
    setPush(activo);
    const resultado = activo ? await registrarPushMovil() : await desregistrarPushMovil();
    setPermiso(await leerPermisoPush());
    setEstadoPush(
      resultado.ok
        ? activo
          ? t('ajustes.pushOk')
          : t('ajustes.pushKo')
        : (resultado.error ?? t('ajustes.pushError')),
    );
    if (!resultado.ok) {
      // El dispositivo sigue como estaba: se revierte el interruptor y no se
      // escribe nada en el servidor (antes se apagaba allí sin querer).
      setPush(anterior);
      return;
    }
    // Solo con el dispositivo ya en el estado pedido se guarda la preferencia
    if (await guardar({ notificacionesPush: activo })) return;
    setPush(anterior);
    Alert.alert(t('comunes.error'), t('comunes.errorActualizar'));
  };

  const cerrarSesion = async () => {
    await salir();
    router.replace('/login');
  };

  /** Interruptor real: preferencia del servidor y permiso del sistema. */
  const pushActivo = push && (permiso?.concedido ?? true);

  return (
    <View style={s.pantalla}>
      <Text style={s.titulo}>{t('pestanas.ajustes')}</Text>

      <Tarjeta>
        <Text style={s.seccion}>{t('ajustes.cuenta')}</Text>
        <Text style={s.valor}>{user?.email ?? t('ajustes.sinSesion')}</Text>
        {!authConfigurada && <Text style={s.aviso}>{t('ajustes.supabaseSinConfig')}</Text>}
      </Tarjeta>

      <Tarjeta>
        <Text style={s.seccion}>{t('ajustes.apariencia')}</Text>
        <View style={s.modos}>
          {MODOS_TEMA.map((valor) => (
            <Text
              key={valor}
              style={[s.modo, modo === valor && s.modoActivo]}
              onPress={() => setModo(valor)}
            >
              {etiquetasModo[valor]}
            </Text>
          ))}
        </View>
      </Tarjeta>

      <Tarjeta>
        <Text style={s.seccion}>{t('ajustes.idioma')}</Text>
        <View style={s.modos}>
          {IDIOMAS.map((idioma) => (
            <Text
              key={idioma}
              accessibilityRole="button"
              accessibilityLabel={idioma === 'es' ? 'Español' : 'English'}
              style={[s.modo, idiomaActual === idioma && s.modoActivo]}
              onPress={() => {
                void cambiarIdioma(idioma).then(() => repintarWidget());
              }}
            >
              {idioma.toUpperCase()}
            </Text>
          ))}
        </View>
      </Tarjeta>

      <Tarjeta>
        <Text style={s.seccion}>{t('ajustes.notificaciones')}</Text>
        <View style={s.fila}>
          <Text style={s.etiqueta}>{t('ajustes.pushDisponibilidad')}</Text>
          <Switch
            value={pushActivo}
            onValueChange={(v) => {
              void cambiarPush(v);
            }}
            trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
            thumbColor="#fff"
          />
        </View>
        {estadoPush ? <Text style={s.pie}>{estadoPush}</Text> : null}
        {permiso && !permiso.concedido && !estadoPush ? (
          <Text style={s.pie}>{t('push.permisoDenegado')}</Text>
        ) : null}
        {permiso && !permiso.concedido && !permiso.puedePreguntar ? (
          <Boton
            titulo={t('ajustes.abrirAjustes')}
            variante="contorno"
            onPress={() => void Linking.openSettings().catch(() => undefined)}
            style={s.botonAjustes}
          />
        ) : null}
        <View style={s.fila}>
          <Text style={s.etiqueta}>{t('ajustes.recordatorio')}</Text>
          <Switch
            value={recordatorio}
            onValueChange={(v) => {
              void guardarConReversion(
                () => setRecordatorio(v),
                () => setRecordatorio(recordatorio),
                { recordatorioSalida: v },
              );
            }}
            trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
            thumbColor="#fff"
          />
        </View>
        {recordatorio ? (
          <View style={{ gap: 6 }}>
            <Text style={s.etiqueta}>{t('ajustes.antelacion')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MINUTOS_RECORDATORIO.map((n) => (
                <Text
                  key={n}
                  onPress={() => {
                    void guardarConReversion(
                      () => setMinutos(n),
                      () => setMinutos(minutos),
                      { minutosRecordatorio: n },
                    );
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    fontSize: 13,
                    overflow: 'hidden',
                    fontWeight: '600',
                    backgroundColor: minutos === n ? paleta.primario : paleta.fondoSecundario,
                    color: minutos === n ? '#ffffff' : paleta.textoSecundario,
                  }}
                >
                  {t('ajustes.antelacionMin', { n })}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
        <View style={s.fila}>
          <Text style={s.etiqueta}>{t('ajustes.resumen')}</Text>
          <Switch
            value={resumen}
            onValueChange={(v) => {
              void guardarConReversion(
                () => setResumen(v),
                () => setResumen(resumen),
                { resumenViaje: v },
              );
            }}
            trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
            thumbColor="#fff"
          />
        </View>
        {guardando ? <Text style={s.pie}>{t('ajustes.guardando')}</Text> : null}
      </Tarjeta>

      <Boton
        titulo={t('ajustes.cerrarSesion')}
        variante="destructivo"
        onPress={() => {
          void cerrarSesion();
        }}
      />
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      backgroundColor: c.fondoSecundario,
      padding: espaciado.md,
      gap: espaciado.sm,
    },
    titulo: {
      fontSize: 22,
      fontWeight: '800',
      color: c.texto,
      marginBottom: espaciado.xs,
    },
    seccion: {
      fontSize: 13,
      fontWeight: '700',
      color: c.primario,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    valor: {
      fontSize: 15,
      color: c.texto,
    },
    aviso: {
      fontSize: 13,
      color: c.aviso,
    },
    modos: {
      flexDirection: 'row',
      gap: espaciado.sm,
      paddingTop: espaciado.xs,
    },
    modo: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textoSecundario,
      borderWidth: 1,
      borderColor: c.borde,
      borderRadius: radio.completo,
      paddingHorizontal: 12,
      paddingVertical: 6,
      overflow: 'hidden',
    },
    modoActivo: {
      color: c.primarioOscuro,
      borderColor: c.primario,
      backgroundColor: c.acento,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaciado.sm,
      paddingVertical: 4,
    },
    etiqueta: {
      fontSize: 15,
      color: c.texto,
      flex: 1,
    },
    pie: {
      fontSize: 12,
      color: c.textoSecundario,
    },
    botonAjustes: {
      alignSelf: 'flex-start',
      minHeight: 40,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
  });
