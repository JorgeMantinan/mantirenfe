import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { PaginaAlertas } from '@/pages/alertas/page';
import { PaginaDetalleAlerta } from '@/pages/alertas/detalle/page';
import { PaginaNuevaAlerta } from '@/pages/alertas/nueva/page';
import { PaginaAuthCallback } from '@/pages/auth/callback/page';
import { PaginaDashboard } from '@/pages/dashboard/page';
import { PaginaEstaciones } from '@/pages/estaciones/page';
import { PaginaIncidencias } from '@/pages/incidencias/page';
import { PaginaLanding } from '@/pages/landing/page';
import { PaginaLogin } from '@/pages/login/page';
import { PaginaMapa } from '@/pages/mapa/page';
import { PaginaPuntualidad } from '@/pages/puntualidad/page';
import { PaginaNoEncontrada } from '@/pages/not-found';
import { PaginaNotificaciones } from '@/pages/notificaciones/page';
import { PaginaRecuperarPassword } from '@/pages/reset/page';
import { PaginaRegistro } from '@/pages/registro/page';
import { PaginaSuprimidos } from '@/pages/suprimidos/page';
import { PaginaAjustes } from '@/pages/ajustes/page';
import { PaginaCookies } from '@/pages/cookies/page';
import { PaginaTransparencia } from '@/pages/transparencia/page';
import { PaginaPrivacidad } from '@/pages/privacidad/page';
import { PaginaTerminos } from '@/pages/terminos/page';
import { PaginaTrenes } from '@/pages/trenes/page';
import { PaginaTrayecto, PaginaTrayectos } from '@/pages/trayectos/page';

function RequiereAuth({ children }: { children: ReactNode }) {
  const { user, cargando, authConfigurada } = useAuth();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!user && authConfigurada) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PaginaLanding />} />
      <Route path="/trayectos" element={<PaginaTrayectos />} />
      <Route path="/trayectos/:origenSlug/:destinoSlug" element={<PaginaTrayecto />} />
      <Route path="/en/trayectos" element={<PaginaTrayectos lang="en" />} />
      <Route path="/en/trayectos/:origenSlug/:destinoSlug" element={<PaginaTrayecto lang="en" />} />
      <Route path="/login" element={<PaginaLogin />} />
      <Route path="/registro" element={<PaginaRegistro />} />
      <Route path="/reset-password" element={<PaginaRecuperarPassword />} />
      <Route path="/auth/callback" element={<PaginaAuthCallback />} />
      <Route path="/transparencia" element={<PaginaTransparencia />} />
      <Route path="/cookies" element={<PaginaCookies />} />
      <Route path="/privacidad" element={<PaginaPrivacidad />} />
      <Route path="/terminos" element={<PaginaTerminos />} />
      <Route element={<AppShell />}>
        <Route
          path="/dashboard"
          element={
            <RequiereAuth>
              <PaginaDashboard />
            </RequiereAuth>
          }
        />
        <Route
          path="/alertas"
          element={
            <RequiereAuth>
              <PaginaAlertas />
            </RequiereAuth>
          }
        />
        <Route
          path="/alertas/nueva"
          element={
            <RequiereAuth>
              <PaginaNuevaAlerta />
            </RequiereAuth>
          }
        />
        <Route
          path="/alertas/:id"
          element={
            <RequiereAuth>
              <PaginaDetalleAlerta />
            </RequiereAuth>
          }
        />
        <Route
          path="/notificaciones"
          element={
            <RequiereAuth>
              <PaginaNotificaciones />
            </RequiereAuth>
          }
        />
        <Route
          path="/ajustes"
          element={
            <RequiereAuth>
              <PaginaAjustes />
            </RequiereAuth>
          }
        />
        <Route path="/mapa" element={<PaginaMapa />} />
        <Route path="/incidencias" element={<PaginaIncidencias />} />
        <Route path="/suprimidos" element={<PaginaSuprimidos />} />
        <Route path="/trenes" element={<PaginaTrenes />} />
        <Route path="/estaciones" element={<PaginaEstaciones />} />
        <Route path="/puntualidad" element={<PaginaPuntualidad />} />
        <Route path="*" element={<PaginaNoEncontrada />} />
      </Route>
    </Routes>
  );
}
