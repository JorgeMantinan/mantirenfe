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
  if (sesion.type !== 'success' || !('url' in sesion)) {
    return { ok: false, error: 'cancelado' };
  }

  try {
    const url = new URL(sesion.url);
    const code = url.searchParams.get('code');
    if (!code) return { ok: false, error: 'sin-codigo' };
    const { error: intercambio } = await supabase.auth.exchangeCodeForSession(code);
    if (intercambio) return { ok: false, error: intercambio.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'oauth-fallo' };
  }
}
