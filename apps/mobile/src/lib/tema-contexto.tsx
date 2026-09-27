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
import { useColorScheme } from 'react-native';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { colores, coloresOscuros, type Paleta } from '@/lib/tema';

export type ModoTema = 'claro' | 'oscuro' | 'sistema';

interface TemaContexto {
  modo: ModoTema;
  setModo: (modo: ModoTema) => void;
  oscuro: boolean;
  paleta: Paleta;
}

const Contexto = createContext<TemaContexto | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  const esquemaSistema = useColorScheme();
  const [modo, setModoEstado] = useState<ModoTema>('sistema');
  const preferencias = useRef<PreferenciasUsuario | null>(null);
  // Timestamp del último cambio manual: un GET lento no debe pisarlo
  const ultimaEdicionRef = useRef(0);

  const cargarPreferencias = useCallback(async () => {
    if (Date.now() - ultimaEdicionRef.current < 8000) return; // no pisar cambios recientes
    try {
      const guardadas = await api<PreferenciasUsuario>('/auth/preferencias');
      preferencias.current = guardadas;
      if (Date.now() - ultimaEdicionRef.current < 8000) return;
      setModoEstado(guardadas.tema);
    } catch {
      // sin sesión o API no disponible: se mantiene el modo actual
    }
  }, []);

  useEffect(() => {
    void cargarPreferencias();
  }, [cargarPreferencias]);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') void cargarPreferencias();
      if (evento === 'SIGNED_OUT') {
        preferencias.current = null;
        setModoEstado('sistema');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [cargarPreferencias]);

  const setModo = useCallback((siguiente: ModoTema) => {
    ultimaEdicionRef.current = Date.now();
    setModoEstado(siguiente);
    void (async () => {
      let actuales: Partial<PreferenciasUsuario> = preferencias.current ?? {};
      if (!preferencias.current) {
        try {
          const conocidas = await api<PreferenciasUsuario>('/auth/preferencias');
          preferencias.current = conocidas;
          actuales = conocidas;
        } catch {
          actuales = {};
        }
      }
      try {
        const guardado = await api<PreferenciasUsuario>('/auth/preferencias', {
          method: 'POST',
          json: { ...actuales, tema: siguiente },
        });
        preferencias.current = guardado;
      } catch {
        // sin sesión el modo queda solo en local
      }
    })();
  }, []);

  const oscuro = modo === 'sistema' ? esquemaSistema === 'dark' : modo === 'oscuro';
  const paleta = oscuro ? coloresOscuros : colores;

  const valor = useMemo(() => ({ modo, setModo, oscuro, paleta }), [modo, setModo, oscuro, paleta]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTema(): TemaContexto {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error('useTema debe usarse dentro de TemaProvider');
  }
  return contexto;
}
