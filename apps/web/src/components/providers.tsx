import { useEffect } from 'react';
import { ThemeProvider as ProveedorTemas, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { aNextTheme, esTemaNext } from '@/lib/tema';

function NormalizaTema() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (theme && !esTemaNext(theme)) setTheme(aNextTheme(theme));
  }, [theme, setTheme]);

  return null;
}

/**
 * La APK pasa `?tema=oscuro|claro` al incrustar páginas: se fuerza ese tema
 * (next-themes lo aplica por encima del guardado/local) para que el WebView
 * siga el modo de la app en vez del localStorage del navegador.
 */
function temaForzado(): 'dark' | 'light' | undefined {
  if (typeof window === 'undefined') return undefined;
  const tema = new URLSearchParams(window.location.search).get('tema');
  return tema === 'oscuro' ? 'dark' : tema === 'claro' ? 'light' : undefined;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorTemas
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={temaForzado()}
    >
      <NormalizaTema />
      <AuthProvider>
        {children}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ProveedorTemas>
  );
}
