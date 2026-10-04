import { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, type Paleta } from '@/lib/tema';

/** Formato admisible del `code` de PKCE (base64url + separadores). */
const CODIGO_SEGURO = /^[A-Za-z0-9._~-]+$/;

/**
 * Destino del deep link `mantirenfe://login-callback`: aterriza aquí el OAuth
 * cuando el navegador vuelve a la app (PKCE). Intercambia el código por una
 * sesión y entra. Si ya hay sesión (el navegador la creó antes), solo navega.
 *
 * Los detalles crudos del proveedor (`error_description`, mensajes de
 * supabase-js) no se pintan: van al log y la persona ve un mensaje nuestro de
 * i18n. Sobre `state`: este flujo no lo guarda en la app, porque la protección
 * contra CSRF la hace supabase-js con el `code_verifier` PKCE que él mismo
 * custodia; aquí solo se comprueba que, si viene, no venga vacío o corrupto.
 */
export default function LoginCallback() {
  const {
    code,
    state,
    error_description: errorDesc,
  } = useLocalSearchParams<{
    code?: string;
    state?: string;
    error_description?: string;
  }>();
  const { paleta } = useTema();
  const { t } = useTranslation();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const s = useMemo(() => estilos(paleta), [paleta]);

  useEffect(() => {
    let vivo = true;
    const fallar = (clave: 'login.oauthError' | 'login.errorGenerico', detalle: unknown) => {
      console.warn('login-callback:', detalle);
      if (vivo) setMensaje(t(clave));
    };
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
          fallar('login.oauthError', errorDesc);
          return;
        }
        // `state` presente pero vacío o con tipos raros: deep link manipulado
        if (state !== undefined && (typeof state !== 'string' || state.length === 0)) {
          fallar('login.errorGenerico', `state inválido: ${JSON.stringify(state)}`);
          return;
        }
        if (!code) {
          fallar('login.oauthError', 'el deep link no trae code');
          return;
        }
        if (!CODIGO_SEGURO.test(code)) {
          fallar('login.errorGenerico', 'code con caracteres no permitidos');
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
          fallar('login.errorGenerico', error.message);
          return;
        }
        router.replace('/(tabs)');
      } catch (e) {
        fallar('login.errorGenerico', e);
      }
    };
    void entrar();
    return () => {
      vivo = false;
    };
  }, [code, state, errorDesc, t]);

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
