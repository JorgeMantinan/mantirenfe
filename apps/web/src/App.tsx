import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';
import { RUTAS_PUBLICAS } from '@/rutas-publicas';

// Rutas privadas: van en su propio chunk y exigen sesión (RequiereAuth).
// Las públicas se declaran en `@/rutas-publicas` (compartido con el prerender).
const PaginaAlertas = lazy(() =>
  import('@/pages/alertas/page').then((m) => ({ default: m.PaginaAlertas })),
);
const PaginaDetalleAlerta = lazy(() =>
  import('@/pages/alertas/detalle/page').then((m) => ({ default: m.PaginaDetalleAlerta })),
);
const PaginaNuevaAlerta = lazy(() =>
  import('@/pages/alertas/nueva/page').then((m) => ({ default: m.PaginaNuevaAlerta })),
);
const PaginaDashboard = lazy(() =>
  import('@/pages/dashboard/page').then((m) => ({ default: m.PaginaDashboard })),
);
const PaginaNoEncontrada = lazy(() =>
  import('@/pages/not-found').then((m) => ({ default: m.PaginaNoEncontrada })),
);
const PaginaNotificaciones = lazy(() =>
  import('@/pages/notificaciones/page').then((m) => ({ default: m.PaginaNotificaciones })),
);
const PaginaAjustes = lazy(() =>
  import('@/pages/ajustes/page').then((m) => ({ default: m.PaginaAjustes })),
);

/** Respaldo mientras se descarga el chunk de la ruta (va dentro del layout). */
function RespaldoRuta() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/** Página lazy envuelta en su Suspense: el esqueleto no tapa el layout. */
const conSuspense = (nodo: ReactNode) => <Suspense fallback={<RespaldoRuta />}>{nodo}</Suspense>;

/**
 * Un `React.lazy` por ruta pública, creado una sola vez a nivel de módulo (si
 * se creara en el render, cada renderización descargaría el chunk otra vez).
 */
const PUBLICAS_DIFERIDAS = RUTAS_PUBLICAS.map((ruta) => ({
  ...ruta,
  Pagina: lazy(ruta.cargar),
}));

/** Rutas públicas que se pintan sueltas (landing, SEO, legales, auth). */
const RUTAS_SUELTAS = PUBLICAS_DIFERIDAS.filter((ruta) => !ruta.enPanel).map((ruta) => (
  <Route key={ruta.ruta} path={ruta.ruta} element={conSuspense(<ruta.Pagina {...ruta.props} />)} />
));

/** Rutas públicas dentro del panel (sidebar + cabecera de la app). */
const RUTAS_EN_PANEL = PUBLICAS_DIFERIDAS.filter((ruta) => ruta.enPanel).map((ruta) => (
  <Route key={ruta.ruta} path={ruta.ruta} element={conSuspense(<ruta.Pagina {...ruta.props} />)} />
));

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
      {RUTAS_SUELTAS}
      <Route element={<AppShell />}>
        {RUTAS_EN_PANEL}
        <Route
          path="/dashboard"
          element={<RequiereAuth>{conSuspense(<PaginaDashboard />)}</RequiereAuth>}
        />
        <Route
          path="/alertas"
          element={<RequiereAuth>{conSuspense(<PaginaAlertas />)}</RequiereAuth>}
        />
        <Route
          path="/alertas/nueva"
          element={<RequiereAuth>{conSuspense(<PaginaNuevaAlerta />)}</RequiereAuth>}
        />
        <Route
          path="/alertas/:id"
          element={<RequiereAuth>{conSuspense(<PaginaDetalleAlerta />)}</RequiereAuth>}
        />
        <Route
          path="/notificaciones"
          element={<RequiereAuth>{conSuspense(<PaginaNotificaciones />)}</RequiereAuth>}
        />
        <Route
          path="/ajustes"
          element={<RequiereAuth>{conSuspense(<PaginaAjustes />)}</RequiereAuth>}
        />
        <Route path="*" element={conSuspense(<PaginaNoEncontrada />)} />
      </Route>
    </Routes>
  );
}
