import { i18n, type Idioma } from '@/i18n';
import { jsonLdAplicacion, jsonLdFaq, jsonLdMigas, jsonLdSitio } from '@/lib/jsonld';
import { metaTrayectos } from '@/lib/trayectos-i18n';
import type { MetaPagina } from '@/lib/seo';

type ConstructorMeta = (lang: Idioma) => MetaPagina;

/* ------------------------------------------------------------------ */
/* Título y descripción de cada página pública.                        */
/* Antes todas las rutas servían el título de `index.html`: Google veía */
/* diez páginas idénticas, que es una señal clara de «contenido de      */
/* poco valor» para AdSense. Cada página declara ahora el suyo.         */
/* ------------------------------------------------------------------ */

const METAS: Record<string, ConstructorMeta> = {
  '/': (lang) => ({
    titulo: i18n.t('meta.landingTitulo', { lng: lang }),
    descripcion: i18n.t('meta.landingDescripcion', { lng: lang }),
    canonical: '/',
    lang,
    jsonLd: [jsonLdSitio(lang), jsonLdAplicacion(lang)],
  }),
  '/guia': (lang) => ({
    titulo: i18n.t('meta.guiaTitulo', { lng: lang }),
    descripcion: i18n.t('meta.guiaDescripcion', { lng: lang }),
    canonical: '/guia',
    lang,
    jsonLd: [
      jsonLdFaq(lang),
      jsonLdMigas(
        [
          { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
          { nombre: i18n.t('guia.h1', { lng: lang }) },
        ],
        lang,
      ),
    ],
  }),
  '/incidencias': (lang) => ({
    titulo: i18n.t('meta.incidenciasTitulo', { lng: lang }),
    descripcion: i18n.t('meta.incidenciasDescripcion', { lng: lang }),
    canonical: '/incidencias',
    lang,
    jsonLd: jsonLdMigas(
      [
        { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
        { nombre: i18n.t('incidencias.titulo', { lng: lang }) },
      ],
      lang,
    ),
  }),
  '/suprimidos': (lang) => ({
    titulo: i18n.t('meta.suprimidosTitulo', { lng: lang }),
    descripcion: i18n.t('meta.suprimidosDescripcion', { lng: lang }),
    canonical: '/suprimidos',
    lang,
    jsonLd: jsonLdMigas(
      [
        { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
        { nombre: i18n.t('suprimidos.titulo', { lng: lang }) },
      ],
      lang,
    ),
  }),
  '/puntualidad': (lang) => ({
    titulo: i18n.t('meta.puntualidadTitulo', { lng: lang }),
    descripcion: i18n.t('meta.puntualidadDescripcion', { lng: lang }),
    canonical: '/puntualidad',
    lang,
    jsonLd: jsonLdMigas(
      [
        { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
        { nombre: i18n.t('puntualidad.titulo', { lng: lang }) },
      ],
      lang,
    ),
  }),
  '/trenes': (lang) => ({
    titulo: i18n.t('meta.trenesTitulo', { lng: lang }),
    descripcion: i18n.t('meta.trenesDescripcion', { lng: lang }),
    canonical: '/trenes',
    lang,
    jsonLd: jsonLdMigas(
      [
        { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
        { nombre: i18n.t('trenes.titulo', { lng: lang }) },
      ],
      lang,
    ),
  }),
  '/estaciones': (lang) => ({
    titulo: i18n.t('meta.estacionesTitulo', { lng: lang }),
    descripcion: i18n.t('meta.estacionesDescripcion', { lng: lang }),
    canonical: '/estaciones',
    lang,
    jsonLd: jsonLdMigas(
      [
        { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
        { nombre: i18n.t('menu.estaciones', { lng: lang }) },
      ],
      lang,
    ),
  }),
  '/mapa': (lang) => ({
    titulo: i18n.t('meta.mapaTitulo', { lng: lang }),
    descripcion: i18n.t('meta.mapaDescripcion', { lng: lang }),
    canonical: '/mapa',
    lang,
    jsonLd: jsonLdMigas(
      [
        { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
        { nombre: i18n.t('mapa.titulo', { lng: lang }) },
      ],
      lang,
    ),
  }),
  '/transparencia': (lang) => ({
    titulo: i18n.t('meta.transparenciaTitulo', { lng: lang }),
    descripcion: i18n.t('meta.transparenciaDescripcion', { lng: lang }),
    canonical: '/transparencia',
    lang,
  }),
  '/privacidad': (lang) => ({
    titulo: i18n.t('meta.privacidadTitulo', { lng: lang }),
    descripcion: i18n.t('meta.privacidadDescripcion', { lng: lang }),
    canonical: '/privacidad',
    lang,
  }),
  '/terminos': (lang) => ({
    titulo: i18n.t('meta.terminosTitulo', { lng: lang }),
    descripcion: i18n.t('meta.terminosDescripcion', { lng: lang }),
    canonical: '/terminos',
    lang,
  }),
  '/cookies': (lang) => ({
    titulo: i18n.t('meta.cookiesTitulo', { lng: lang }),
    descripcion: i18n.t('meta.cookiesDescripcion', { lng: lang }),
    canonical: '/cookies',
    lang,
  }),
};

/** Rutas bilingües de trayecto: su meta la construye `lib/trayectos-i18n.ts`. */
const RUTAS_TRAYECTO = new Set(['/trayectos', '/en/trayectos']);

/**
 * Meta de una página pública por su ruta (`null` si la página no tiene
 * título propio y debe quedarse con el de `index.html`).
 *
 * El detalle de trayecto (`/trayectos/a/b`) no está aquí: su meta necesita el
 * nombre de las estaciones, así que la construye la propia página con
 * `metaTrayecto`.
 */
export function metaDeRuta(ruta: string, lang: Idioma = 'es'): MetaPagina | null {
  if (RUTAS_TRAYECTO.has(ruta)) return metaTrayectos(lang);
  return METAS[ruta]?.(lang) ?? null;
}

/** ¿La ruta declara sus propios tags SEO? (`IdiomaProvider` no la pisa). */
export function tieneMetaPropia(ruta: string): boolean {
  return RUTAS_TRAYECTO.has(ruta) || ruta in METAS;
}
