import { ThemeProvider as ProveedorTemas } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorTemas attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        {children}
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ProveedorTemas>
  );
}
