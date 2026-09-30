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

const CLAVE_TEMA = 'mantirenfe:tema';

function leerModoLocal(): ModoTema | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const guardado = localStorage.getItem(CLAVE_TEMA);
    return guardado === 'claro' || guardado === 'oscuro' || guardado === 'sistema'
      ? guardado
      : null;
  } catch {
    return null;
  }
}

function escribirModoLocal(modo: ModoTema): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CLAVE_TEMA, modo);
  } catch {
    return;
  }
}

interface TemaContexto {
  modo: ModoTema;
  setModo: (modo: ModoTema) => void;
  oscuro: boolean;
  paleta: Paleta;
}

const Contexto = createContext<TemaContexto | null>(null);

export function TemaProvider({ children }: { children: ReactNode }) {
  const esquemaSistema = useColorScheme();
  const [modo, setModoEstado] = useState<ModoTema>(() => leerModoLocal() ?? 'sistema');
  const huboEdicionRef = useRef(false);
  const ordenGuardadoRef = useRef(0);

  const aplicar = useCallback((siguiente: ModoTema) => {
    setModoEstado(siguiente);
    escribirModoLocal(siguiente);
  }, []);

  const cargarPreferencias = useCallback(async () => {
    if (huboEdicionRef.current) return;
    try {
      const guardadas = await api<PreferenciasUsuario>('/auth/preferencias');
      if (huboEdicionRef.current) return;
      aplicar(guardadas.tema);
    } catch {
      // sin sesión o API no disponible: se mantiene el modo actual
    }
  }, [aplicar]);

  useEffect(() => {
    void cargarPreferencias();
  }, [cargarPreferencias]);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') void cargarPreferencias();
      if (evento === 'SIGNED_OUT') {
        huboEdicionRef.current = false;
        aplicar('sistema');
      }
    });
    return () => data.subscription.unsubscribe();
  }, [aplicar, cargarPreferencias]);

  const setModo = useCallback(
    (siguiente: ModoTema) => {
      huboEdicionRef.current = true;
      aplicar(siguiente);
      const orden = ++ordenGuardadoRef.current;
      void (async () => {
        let actuales: PreferenciasUsuario;
        try {
          actuales = await api<PreferenciasUsuario>('/auth/preferencias');
        } catch {
          return;
        }
        if (orden !== ordenGuardadoRef.current) return;
        try {
          await api<PreferenciasUsuario>('/auth/preferencias', {
            method: 'POST',
            json: { ...actuales, tema: siguiente },
          });
        } catch {
          // sin sesión el modo queda solo en local
        }
      })();
    },
    [aplicar],
  );

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
