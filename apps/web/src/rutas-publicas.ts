import type { ComponentType } from 'react';
import type { Idioma } from '@/i18n';

/**
 * Props que aceptan las páginas públicas: solo las de trayecto reciben algo
 * (`lang` en las rutas `/en/...`). El resto ignoran el resto de props.
 */
export interface PaginaPublicaProps {
  lang?: Idioma;
}

export interface RutaPublica {
  /** Patrón de React Router, p. ej. `"/trayectos/:origenSlug/:destinoSlug"`. */
  ruta: string;
  /** Import diferido del módulo de la página (React.lazy en la app). */
  cargar: () => Promise<{ default: ComponentType<PaginaPublicaProps> }>;
  /** Props fijas de la página (p. ej. `{ lang: 'en' }` en `/en/trayectos`). */
  props?: PaginaPublicaProps;
  /** Idioma de la URL: manda para hreflang y para el prerender. */
  lang?: Idioma;
  /** true → se pinta dentro de AppShell (sidebar del panel) y no suelto. */
  enPanel?: boolean;
  /**
   * true → el build genera `dist/<ruta>.html` con el contenido ya renderizado
   * (SEO/AdSense: un rastreador sin JavaScript ve texto, no un `#root` vacío).
   * Las rutas con parámetros se prerenderizan una a una (ver `scripts/prerender.tsx`).
   */
  prerender: boolean;
}

/**
 * Única fuente de verdad de las rutas públicas: las consume `App.tsx` (que
 * las pinta con `React.lazy` + `Suspense`) y `scripts/prerender.tsx` (que las
 * renderiza en Node durante el build para servir HTML con contenido).
 *
 * Las rutas privadas (dashboard, alertas, ajustes, notificaciones) viven en
 * `App.tsx`, envueltas en `RequiereAuth`.
 */
export const RUTAS_PUBLICAS: RutaPublica[] = [
  {
    ruta: '/',
    prerender: true,
    cargar: () => import('@/pages/landing/page').then((m) => ({ default: m.PaginaLanding })),
  },
  {
    ruta: '/trayectos',
    prerender: true,
    cargar: () => import('@/pages/trayectos/page').then((m) => ({ default: m.PaginaTrayectos })),
  },
  {
    ruta: '/trayectos/:origenSlug/:destinoSlug',
    prerender: true,
    cargar: () => import('@/pages/trayectos/page').then((m) => ({ default: m.PaginaTrayecto })),
  },
  {
    ruta: '/en/trayectos',
    lang: 'en',
    props: { lang: 'en' },
    prerender: true,
    cargar: () => import('@/pages/trayectos/page').then((m) => ({ default: m.PaginaTrayectos })),
  },
  {
    ruta: '/en/trayectos/:origenSlug/:destinoSlug',
    lang: 'en',
    props: { lang: 'en' },
    prerender: true,
    cargar: () => import('@/pages/trayectos/page').then((m) => ({ default: m.PaginaTrayecto })),
  },
  {
    ruta: '/guia',
    prerender: true,
    cargar: () => import('@/pages/guia/page').then((m) => ({ default: m.PaginaGuia })),
  },
  {
    ruta: '/mapa',
    enPanel: true,
    // Leaflet exige `window` al importarse: no se puede renderizar en Node.
    prerender: false,
    cargar: () => import('@/pages/mapa/page').then((m) => ({ default: m.PaginaMapa })),
  },
  {
    ruta: '/incidencias',
    enPanel: true,
    prerender: true,
    cargar: () =>
      import('@/pages/incidencias/page').then((m) => ({ default: m.PaginaIncidencias })),
  },
  {
    ruta: '/suprimidos',
    enPanel: true,
    prerender: true,
    cargar: () => import('@/pages/suprimidos/page').then((m) => ({ default: m.PaginaSuprimidos })),
  },
  {
    ruta: '/puntualidad',
    enPanel: true,
    prerender: true,
    cargar: () =>
      import('@/pages/puntualidad/page').then((m) => ({ default: m.PaginaPuntualidad })),
  },
  {
    ruta: '/trenes',
    enPanel: true,
    prerender: true,
    cargar: () => import('@/pages/trenes/page').then((m) => ({ default: m.PaginaTrenes })),
  },
  {
    ruta: '/estaciones',
    enPanel: true,
    prerender: true,
    cargar: () => import('@/pages/estaciones/page').then((m) => ({ default: m.PaginaEstaciones })),
  },
  {
    ruta: '/transparencia',
    prerender: true,
    cargar: () =>
      import('@/pages/transparencia/page').then((m) => ({ default: m.PaginaTransparencia })),
  },
  {
    ruta: '/privacidad',
    prerender: true,
    cargar: () => import('@/pages/privacidad/page').then((m) => ({ default: m.PaginaPrivacidad })),
  },
  {
    ruta: '/terminos',
    prerender: true,
    cargar: () => import('@/pages/terminos/page').then((m) => ({ default: m.PaginaTerminos })),
  },
  {
    ruta: '/cookies',
    prerender: true,
    cargar: () => import('@/pages/cookies/page').then((m) => ({ default: m.PaginaCookies })),
  },
  // Formularios sin contenido que rastrear: no se prerenderizan ni se
  // enlazan desde el sitemap.
  {
    ruta: '/login',
    prerender: false,
    cargar: () => import('@/pages/login/page').then((m) => ({ default: m.PaginaLogin })),
  },
  {
    ruta: '/registro',
    prerender: false,
    cargar: () => import('@/pages/registro/page').then((m) => ({ default: m.PaginaRegistro })),
  },
  {
    ruta: '/reset-password',
    prerender: false,
    cargar: () =>
      import('@/pages/reset/page').then((m) => ({ default: m.PaginaRecuperarPassword })),
  },
  {
    ruta: '/auth/callback',
    prerender: false,
    cargar: () =>
      import('@/pages/auth/callback/page').then((m) => ({ default: m.PaginaAuthCallback })),
  },
];
