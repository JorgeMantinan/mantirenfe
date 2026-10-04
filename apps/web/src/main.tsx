import { Suspense, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Providers } from './components/providers';
import { Skeleton } from './components/ui/skeleton';
import { IdiomaProvider } from './i18n/IdiomaProvider';
import './styles/globals.css';

registerSW({ immediate: true });

/** Respaldo mientras se descarga el chunk de la ruta (React.lazy). */
function RespaldoCarga() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

async function iniciarSentry() {
  // Sin VITE_SENTRY_DSN no se importa nada: el chunk de @sentry/react ni se descarga.
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
}

async function arrancar() {
  await iniciarSentry();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <IdiomaProvider>
          <Providers>
            <ErrorBoundary>
              <Suspense fallback={<RespaldoCarga />}>
                <App />
              </Suspense>
            </ErrorBoundary>
          </Providers>
        </IdiomaProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

void arrancar();
