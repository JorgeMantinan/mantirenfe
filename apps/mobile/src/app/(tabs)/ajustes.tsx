import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';
import { Boton } from '@/components/Boton';
import { Tarjeta } from '@/components/Tarjeta';
import { useAuth } from '@/hooks/useAuth';
import { cambiarIdioma, IDIOMAS, type Idioma } from '@/i18n';
import { api } from '@/lib/api';
import { desregistrarPushMovil, registrarPushMovil } from '@/lib/push';
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
  const s = useMemo(() => estilos(paleta), [paleta]);

  const idiomaActual: Idioma = i18n.language === 'en' ? 'en' : 'es';
  const etiquetasModo: Record<ModoTema, string> = {
    claro: t('ajustes.temaClaro'),
    oscuro: t('ajustes.temaOscuro'),
    sistema: t('ajustes.temaSistema'),
  };

  useEffect(() => {
    if (!authConfigurada) return;
    api<PreferenciasUsuario>('/auth/preferencias')
      .then((p) => {
        setPref(p);
        setPush(p.notificacionesPush);
        setRecordatorio(p.recordatorioSalida);
        setMinutos(p.minutosRecordatorio ?? 50);
        setResumen(p.resumenViaje);
      })
      .catch(() => {
        // sin preferencias guardadas: se mantienen los valores por defecto
      });
  }, [authConfigurada]);

  const cambiarPush = async (activo: boolean) => {
    setPush(activo);
    const resultado = activo ? await registrarPushMovil() : await desregistrarPushMovil();
    setEstadoPush(
      resultado.ok
        ? activo
          ? t('ajustes.pushOk')
          : t('ajustes.pushKo')
        : (resultado.error ?? t('ajustes.pushError')),
    );
    if (!resultado.ok && activo) setPush(false);
    void guardar({ notificacionesPush: activo && resultado.ok });
  };

  const guardar = async (parcial: Partial<PreferenciasUsuario>) => {
    setGuardando(true);
    try {
      const siguiente = { ...(pref ?? {}), ...parcial, tema: modo } as PreferenciasUsuario;
      const guardado = await api<PreferenciasUsuario>('/auth/preferencias', {
        method: 'POST',
        json: siguiente,
      });
      setPref(guardado);
    } catch {
      // preferencias opcionales: no bloquear la UI
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesion = async () => {
    await salir();
    router.replace('/login');
  };

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
            value={push}
            onValueChange={(v) => {
              void cambiarPush(v);
            }}
            trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
            thumbColor="#fff"
          />
        </View>
        {estadoPush ? <Text style={s.pie}>{estadoPush}</Text> : null}
        <View style={s.fila}>
          <Text style={s.etiqueta}>{t('ajustes.recordatorio')}</Text>
          <Switch
            value={recordatorio}
            onValueChange={(v) => {
              setRecordatorio(v);
              void guardar({ recordatorioSalida: v });
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
                    setMinutos(n);
                    void guardar({ minutosRecordatorio: n });
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
              setResumen(v);
              void guardar({ resumenViaje: v });
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
  });
