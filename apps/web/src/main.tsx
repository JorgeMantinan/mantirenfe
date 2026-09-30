import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { Providers } from './components/providers';
import { IdiomaProvider } from './i18n/IdiomaProvider';
import './styles/globals.css';

registerSW({ immediate: true });

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
            <App />
          </Providers>
        </IdiomaProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

void arrancar();
