import { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

/**
 * Destino del deep link `mantirenfe://login-callback`: aterriza aquí el OAuth
 * cuando el navegador vuelve a la app (PKCE). Intercambia el código por una
 * sesión y entra. Si ya hay sesión (el navegador la creó antes), solo navega.
 */
export default function LoginCallback() {
  const { code, error_description: errorDesc } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const { paleta } = useTema();
  const { t } = useTranslation();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const s = useMemo(() => estilos(paleta), [paleta]);

  useEffect(() => {
    let vivo = true;
    const entrar = async () => {
      if (!supabase) {
        router.replace('/login');
        return;
      }
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          router.replace('/(tabs)');
          return;
        }
        if (errorDesc) {
          if (vivo) setMensaje(String(errorDesc));
          return;
        }
        if (!code) {
          if (vivo) setMensaje(t('login.oauthError'));
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // El código puede haberse consumido ya en otra ruta: reintentar sesión
          const { data: otra } = await supabase.auth.getSession();
          if (otra.session) {
            router.replace('/(tabs)');
            return;
          }
          if (vivo) setMensaje(error.message);
          return;
        }
        router.replace('/(tabs)');
      } catch (e) {
        if (vivo) setMensaje(e instanceof Error ? e.message : String(e));
      }
    };
    void entrar();
    return () => {
      vivo = false;
    };
  }, [code, errorDesc, t]);

  return (
    <View style={s.pantalla}>
      <Text style={s.titulo}>{t('login.entrando')}</Text>
      {mensaje ? <Text style={s.error}>{mensaje}</Text> : null}
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    pantalla: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: espaciado.sm,
      backgroundColor: c.fondo,
      padding: espaciado.lg,
    },
    titulo: {
      fontSize: 16,
      fontWeight: '600',
      color: c.texto,
    },
    error: {
      fontSize: 14,
      color: c.error,
      textAlign: 'center',
    },
  });
