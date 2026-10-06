import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  authConfigurada,
  cerrarSesionCookie,
  consultarSesionCookie,
  loginConCookie,
  sesionDeCookie,
  supabase,
  tokenEnMemoria,
  type FuenteSesion,
  type SesionCookie,
} from '@/lib/supabase';
import { i18n } from '@/i18n';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  cargando: boolean;
  authConfigurada: boolean;
  /** De dónde sale la sesión activa: cookie httpOnly (BFF) o supabase-js. */
  fuente: FuenteSesion | null;
  /** Relee la sesión (cookie → supabase-js). Devuelve si hay sesión. */
  recargarSesion: () => Promise<boolean>;
  entrar: (email: string, password: string) => Promise<void>;
  registrarse: (email: string, password: string, nombre: string) => Promise<boolean>;
  entrarConGoogle: () => Promise<void>;
  entrarConMicrosoft: () => Promise<void>;
  salir: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [cargando, setCargando] = useState(authConfigurada);
  const [fuente, setFuente] = useState<FuenteSesion | null>(null);
  // Lo leen los oyentes de supabase-js, que deben ver la fuente YA actualizada
  const fuenteRef = useRef<FuenteSesion | null>(null);

  const marcarFuente = useCallback((nueva: FuenteSesion | null) => {
    fuenteRef.current = nueva;
    setFuente(nueva);
  }, []);

  const aplicarCookie = useCallback(
    (sesionCookie: SesionCookie) => {
      const nueva = sesionDeCookie(sesionCookie);
      setSession(nueva);
      setUser(nueva.user);
      marcarFuente('cookie');
    },
    [marcarFuente],
  );

  const recargarSesion = useCallback(async (): Promise<boolean> => {
    // 1) Cookie httpOnly: la renueva el BFF si el access token caducó
    const enCookie = await consultarSesionCookie();
    if (enCookie) {
      aplicarCookie(enCookie);
      return true;
    }
    // 2) Sesión legada en localStorage (convive con la cookie; no se borra)
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          tokenEnMemoria.fijar(data.session.access_token);
          setSession(data.session);
          setUser(data.session.user);
          marcarFuente('supabase');
          return true;
        }
      } catch {
        // Sin sesión legada utilizable
      }
    }
    setSession(null);
    setUser(null);
    marcarFuente(null);
    return false;
  }, [aplicarCookie, marcarFuente]);

  useEffect(() => {
    const suscripcion = supabase?.auth.onAuthStateChange((_evento, nuevaSesion) => {
      // Con sesión de cookie manda el BFF: los avisos de la sesión legada
      // (INITIAL_SESSION nulo, refrescos del storage) no deben pisarla.
      if (fuenteRef.current === 'cookie') return;
      if (nuevaSesion) {
        tokenEnMemoria.fijar(nuevaSesion.access_token);
        setSession(nuevaSesion);
        setUser(nuevaSesion.user);
        marcarFuente('supabase');
      } else {
        setSession(null);
        setUser(null);
        marcarFuente(null);
      }
      setCargando(false);
    });

    let cancelado = false;
    void recargarSesion().finally(() => {
      if (!cancelado) setCargando(false);
    });

    return () => {
      cancelado = true;
      suscripcion?.data.subscription.unsubscribe();
    };
  }, [marcarFuente, recargarSesion]);

  const entrar = useCallback(
    async (email: string, password: string) => {
      // 1) BFF: sesión en cookie httpOnly y access token SOLO en memoria
      const cookie = await loginConCookie(email, password);
      if (cookie.ok) {
        const sesionCookie = await consultarSesionCookie();
        if (sesionCookie) {
          aplicarCookie(sesionCookie);
          return;
        }
      }
      // 2) Fallback: el flujo de siempre con supabase-js (no se rompe nada)
      if (!supabase) {
        throw new Error(cookie.mensaje ?? i18n.t('errores.authNoConfig'));
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(cookie.mensaje ?? error.message);
      if (data.session) {
        tokenEnMemoria.fijar(data.session.access_token);
        setSession(data.session);
        setUser(data.session.user);
        marcarFuente('supabase');
      }
    },
    [aplicarCookie, marcarFuente],
  );

  const registrarse = useCallback(async (email: string, password: string, nombre: string) => {
    if (!supabase) throw new Error(i18n.t('errores.authNoConfig'));
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: nombre } },
    });
    if (error) throw new Error(error.message);
    // true = la cuenta quedó pendiente de confirmar el email (no hay sesión)
    return !data.session;
  }, []);

  const entrarConGoogle = useCallback(async () => {
    if (!supabase) throw new Error(i18n.t('errores.authNoConfig'));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(error.message);
  }, []);

  const entrarConMicrosoft = useCallback(async () => {
    if (!supabase) throw new Error(i18n.t('errores.authNoConfig'));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email',
      },
    });
    if (error) throw new Error(error.message);
  }, []);

  const salir = useCallback(async () => {
    // El estado se limpia YA: el cierre no depende de que llegue la petición
    setSession(null);
    setUser(null);
    marcarFuente(null);
    tokenEnMemoria.limpiar();
    await cerrarSesionCookie();
    if (supabase) {
      try {
        // Borra también la sesión legada de localStorage
        await supabase.auth.signOut();
      } catch {
        // Mejor esfuerzo: no hay sesión que mantener a mano
      }
    }
  }, [marcarFuente]);

  const valor = useMemo(
    () => ({
      user,
      session,
      cargando,
      authConfigurada,
      fuente,
      recargarSesion,
      entrar,
      registrarse,
      entrarConGoogle,
      entrarConMicrosoft,
      salir,
    }),
    [
      user,
      session,
      cargando,
      fuente,
      recargarSesion,
      entrar,
      registrarse,
      entrarConGoogle,
      entrarConMicrosoft,
      salir,
    ],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return contexto;
}
