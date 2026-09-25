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

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  cargando: boolean;
  authConfigurada: boolean;
  entrar: (email: string, password: string) => Promise<void>;
  registrarse: (email: string, password: string, nombre: string) => Promise<boolean>;
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

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setCargando(false);
    });

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSession(nuevaSesion);
      setUser(nuevaSesion?.user ?? null);
      setCargando(false);
    });

    return () => suscripcion.subscription.unsubscribe();
  }, []);

  const entrar = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Autenticación no configurada (EXPO_PUBLIC_SUPABASE_URL)');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const registrarse = useCallback(async (email: string, password: string, nombre: string) => {
    if (!supabase) throw new Error('Autenticación no configurada (EXPO_PUBLIC_SUPABASE_URL)');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: nombre } },
    });
    if (error) throw new Error(error.message);
    // true = la cuenta quedó pendiente de confirmar el email (no hay sesión)
    return !data.session;
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
      salir,
    }),
    [user, session, cargando, entrar, registrarse, salir],
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
