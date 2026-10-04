import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authConfigurada, supabase } from '@/lib/supabase';
import { i18n } from '@/i18n';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  cargando: boolean;
  authConfigurada: boolean;
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

  useEffect(() => {
    if (!supabase) {
      setCargando(false);
      return;
    }

    // Sin .catch/.finally el panel se quedaría en «cargando» para siempre
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch(() => null)
      .finally(() => setCargando(false));

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion);
      setUser(nuevaSesion?.user ?? null);
      setCargando(false);
    });

    return () => suscripcion.subscription.unsubscribe();
  }, []);

  const entrar = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error(i18n.t('errores.authNoConfig'));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

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
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const valor = useMemo(
    () => ({
      user,
      session,
      cargando,
      authConfigurada,
      entrar,
      registrarse,
      entrarConGoogle,
      entrarConMicrosoft,
      salir,
    }),
    [user, session, cargando, entrar, registrarse, entrarConGoogle, entrarConMicrosoft, salir],
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
