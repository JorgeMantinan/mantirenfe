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

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorTemas attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NormalizaTema />
      <AuthProvider>
        {children}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ProveedorTemas>
  );
}
