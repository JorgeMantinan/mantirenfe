import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { AppShell } from '@/components/layout/AppShell';

// Todas las páginas van en su propio chunk: el bundle raíz solo arrastra el
// layout, el router y los componentes compartidos.
const PaginaAlertas = lazy(() =>
  import('@/pages/alertas/page').then((m) => ({ default: m.PaginaAlertas })),
);
const PaginaDetalleAlerta = lazy(() =>
  import('@/pages/alertas/detalle/page').then((m) => ({ default: m.PaginaDetalleAlerta })),
);
const PaginaNuevaAlerta = lazy(() =>
  import('@/pages/alertas/nueva/page').then((m) => ({ default: m.PaginaNuevaAlerta })),
);
const PaginaAuthCallback = lazy(() =>
  import('@/pages/auth/callback/page').then((m) => ({ default: m.PaginaAuthCallback })),
);
const PaginaDashboard = lazy(() =>
  import('@/pages/dashboard/page').then((m) => ({ default: m.PaginaDashboard })),
);
const PaginaEstaciones = lazy(() =>
  import('@/pages/estaciones/page').then((m) => ({ default: m.PaginaEstaciones })),
);
const PaginaIncidencias = lazy(() =>
  import('@/pages/incidencias/page').then((m) => ({ default: m.PaginaIncidencias })),
);
const PaginaLanding = lazy(() =>
  import('@/pages/landing/page').then((m) => ({ default: m.PaginaLanding })),
);
const PaginaLogin = lazy(() =>
  import('@/pages/login/page').then((m) => ({ default: m.PaginaLogin })),
);
const PaginaMapa = lazy(() => import('@/pages/mapa/page').then((m) => ({ default: m.PaginaMapa })));
const PaginaPuntualidad = lazy(() =>
  import('@/pages/puntualidad/page').then((m) => ({ default: m.PaginaPuntualidad })),
);
const PaginaNoEncontrada = lazy(() =>
  import('@/pages/not-found').then((m) => ({ default: m.PaginaNoEncontrada })),
);
const PaginaNotificaciones = lazy(() =>
  import('@/pages/notificaciones/page').then((m) => ({ default: m.PaginaNotificaciones })),
);
const PaginaRecuperarPassword = lazy(() =>
  import('@/pages/reset/page').then((m) => ({ default: m.PaginaRecuperarPassword })),
);
const PaginaRegistro = lazy(() =>
  import('@/pages/registro/page').then((m) => ({ default: m.PaginaRegistro })),
);
const PaginaSuprimidos = lazy(() =>
  import('@/pages/suprimidos/page').then((m) => ({ default: m.PaginaSuprimidos })),
);
const PaginaAjustes = lazy(() =>
  import('@/pages/ajustes/page').then((m) => ({ default: m.PaginaAjustes })),
);
const PaginaCookies = lazy(() =>
  import('@/pages/cookies/page').then((m) => ({ default: m.PaginaCookies })),
);
const PaginaTransparencia = lazy(() =>
  import('@/pages/transparencia/page').then((m) => ({ default: m.PaginaTransparencia })),
);
const PaginaPrivacidad = lazy(() =>
  import('@/pages/privacidad/page').then((m) => ({ default: m.PaginaPrivacidad })),
);
const PaginaTerminos = lazy(() =>
  import('@/pages/terminos/page').then((m) => ({ default: m.PaginaTerminos })),
);
const PaginaTrenes = lazy(() =>
  import('@/pages/trenes/page').then((m) => ({ default: m.PaginaTrenes })),
);
// Un mismo módulo con dos páginas: cada lazy apunta a su export
const PaginaTrayectos = lazy(() =>
  import('@/pages/trayectos/page').then((m) => ({ default: m.PaginaTrayectos })),
);
const PaginaTrayecto = lazy(() =>
  import('@/pages/trayectos/page').then((m) => ({ default: m.PaginaTrayecto })),
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
      <Route path="/" element={conSuspense(<PaginaLanding />)} />
      <Route path="/trayectos" element={conSuspense(<PaginaTrayectos />)} />
      <Route path="/trayectos/:origenSlug/:destinoSlug" element={conSuspense(<PaginaTrayecto />)} />
      <Route path="/en/trayectos" element={conSuspense(<PaginaTrayectos lang="en" />)} />
      <Route
        path="/en/trayectos/:origenSlug/:destinoSlug"
        element={conSuspense(<PaginaTrayecto lang="en" />)}
      />
      <Route path="/login" element={conSuspense(<PaginaLogin />)} />
      <Route path="/registro" element={conSuspense(<PaginaRegistro />)} />
      <Route path="/reset-password" element={conSuspense(<PaginaRecuperarPassword />)} />
      <Route path="/auth/callback" element={conSuspense(<PaginaAuthCallback />)} />
      <Route path="/transparencia" element={conSuspense(<PaginaTransparencia />)} />
      <Route path="/cookies" element={conSuspense(<PaginaCookies />)} />
      <Route path="/privacidad" element={conSuspense(<PaginaPrivacidad />)} />
      <Route path="/terminos" element={conSuspense(<PaginaTerminos />)} />
      <Route element={<AppShell />}>
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
        <Route path="/mapa" element={conSuspense(<PaginaMapa />)} />
        <Route path="/incidencias" element={conSuspense(<PaginaIncidencias />)} />
        <Route path="/suprimidos" element={conSuspense(<PaginaSuprimidos />)} />
        <Route path="/trenes" element={conSuspense(<PaginaTrenes />)} />
        <Route path="/estaciones" element={conSuspense(<PaginaEstaciones />)} />
        <Route path="/puntualidad" element={conSuspense(<PaginaPuntualidad />)} />
        <Route path="*" element={conSuspense(<PaginaNoEncontrada />)} />
      </Route>
    </Routes>
  );
}
