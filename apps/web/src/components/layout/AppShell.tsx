import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

/**
 * ¿Estamos dentro de la app móvil? WebView (UA MantiRenfeApp) o `?app=1`.
 * En ese caso no se pinta la «web dentro de la web»: solo la página.
 */
function esEmbebido(search: string): boolean {
  if (new URLSearchParams(search).get('app') === '1') return true;
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('MantiRenfeApp');
}

export function AppShell() {
  const { authConfigurada } = useAuth();
  const { search } = useLocation();

  if (esEmbebido(search)) {
    return (
      <main className="h-screen overflow-y-auto bg-background p-0 sm:p-0">
        <Outlet />
      </main>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar authConfigurada={authConfigurada} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
