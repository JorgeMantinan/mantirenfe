import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { authConfigurada, supabase } from './supabase';

export type ResultadoOAuth = { ok: boolean; error?: string };

/**
 * "Continuar con Google" en la app móvil: abre el navegador del sistema con el
 * flujo OAuth de Supabase (PKCE) y vuelve a la app por deep link.
 *
 * Requiere autorizar en Supabase → Authentication → Sign In / Providers →
 * Google → Redirect URLs:
 *   mantirenfe://login-callback
 *   com.mantirenfe.app://login-callback
 */
export async function entrarConOAuth(proveedor: 'google'): Promise<ResultadoOAuth> {
  if (!supabase || !authConfigurada) return { ok: false, error: 'auth-no-configurada' };

  const redirectTo = Linking.createURL('login-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: proveedor,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { ok: false, error: error?.message ?? 'sin-url' };

  const sesion = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (sesion.type === 'success' && 'url' in sesion) {
    // Captura en el navegador (iOS y parte de Android): intercambio aquí
    try {
      const url = new URL(sesion.url);
      const code = url.searchParams.get('code');
      if (code) {
        const { error: intercambio } = await supabase.auth.exchangeCodeForSession(code);
        if (!intercambio) return { ok: true };
      }
    } catch {
      // seguimos por la comprobación de sesión de abajo
    }
  }

  // En Android el deep link suele navegar la app por expo-router a
  // /login-callback (que hace el intercambio): si al volver ya hay sesión, ok.
  const { data: actual } = await supabase.auth.getSession();
  if (actual.session) return { ok: true };

  if (sesion.type === 'dismiss' || sesion.type === 'cancel') {
    return { ok: false, error: 'cancelado' };
  }
  return { ok: false, error: 'sin-codigo' };
}
