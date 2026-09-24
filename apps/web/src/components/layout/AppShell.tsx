import { Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const { authConfigurada } = useAuth();

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
