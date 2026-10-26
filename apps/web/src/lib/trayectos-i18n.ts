import type { MetaPagina } from './seo';
import { jsonLdMigas } from '@/lib/jsonld';
import { esRutaTrayecto, i18n, rutaEnIdioma, type Idioma } from '@/i18n';

export { esRutaTrayecto, rutaEnIdioma };
export type { Idioma };

/**
 * Fachada de textos SEO de trayecto sobre el sistema i18n único de la web:
 * los textos viven en `src/i18n/es.ts` y `src/i18n/en.ts`, aquí solo se
 * exponen con la forma (funciones con parámetros) que espera la página y se
 * fija el idioma con `lng`, que es el que manda en las rutas `/en/...`.
 */

/** Frase partida para poder resaltar los nombres de estación en negrita. */
export interface TextoConEstaciones {
  antes: string;
  entre: string;
  despues: string;
}

export interface TextosTrayecto {
  /** Prefijo de rutas de trayecto en este idioma ("/trayectos" | "/en/trayectos"). */
  rutaBase: string;
  migasTrayectos: string;
  migasAria: string;
  h1: (origen: string, destino: string) => string;
  subtitulo: (fecha: string) => string;
  sinEstacionTitulo: string;
  sinEstacionDescripcion: (faltantes: string) => string;
  /** Une los nombres de estación que no se han encontrado ("y" / "and"). */
  faltanteUnion: string;
  etiquetaOrigen: string;
  etiquetaDestino: string;
  columnaSalida: string;
  columnaLlegada: string;
  columnaDuracion: string;
  columnaTren: string;
  columnaOperador: string;
  sinResultados: TextoConEstaciones;
  sinDirectos: (origen: string, destino: string) => string;
  transbordoEn: (estacion: string) => string;
  espera: (minutos: number) => string;
  tarjetaTitulo: string;
  tarjetaDescripcion: (
    directas: number,
    conTransbordo: number,
    fuente: string | null,
    limite: number,
  ) => string;
  ctaTitulo: (origen: string, destino: string) => string;
  ctaTexto: string;
  ctaBoton: string;
  datosTitulo: string;
  datosOrigen: (fuente: string | null) => string;
  datosIndependiente: string;
  otrosTitulo: string;
  otrosDescripcion: string;
  errorCarga: string;
}

export interface TextosTrayectos {
  /** Prefijo de rutas de trayecto en este idioma ("/trayectos" | "/en/trayectos"). */
  rutaBase: string;
  h1: string;
  subtitulo: string;
  buscadorTitulo: string;
  buscadorDescripcion: string;
  etiquetaOrigen: string;
  etiquetaDestino: string;
  botonBuscar: string;
  popularesTitulo: string;
  popularesDescripcion: (total: number) => string;
}

function construirTrayecto(lang: Idioma): TextosTrayecto {
  return {
    rutaBase: i18n.t('trayecto.rutaBase', { lng: lang }),
    migasTrayectos: i18n.t('trayecto.migasTrayectos', { lng: lang }),
    migasAria: i18n.t('trayecto.migasAria', { lng: lang }),
    h1: (origen, destino) => i18n.t('trayecto.h1', { lng: lang, origen, destino }),
    subtitulo: (fecha) => i18n.t('trayecto.subtitulo', { lng: lang, fecha }),
    sinEstacionTitulo: i18n.t('trayecto.sinEstacionTitulo', { lng: lang }),
    sinEstacionDescripcion: (faltantes) =>
      i18n.t('trayecto.sinEstacionDescripcion', { lng: lang, faltantes }),
    faltanteUnion: i18n.t('trayecto.faltanteUnion', { lng: lang }),
    etiquetaOrigen: i18n.t('trayecto.etiquetaOrigen', { lng: lang }),
    etiquetaDestino: i18n.t('trayecto.etiquetaDestino', { lng: lang }),
    columnaSalida: i18n.t('trayecto.columnaSalida', { lng: lang }),
    columnaLlegada: i18n.t('trayecto.columnaLlegada', { lng: lang }),
    columnaDuracion: i18n.t('trayecto.columnaDuracion', { lng: lang }),
    columnaTren: i18n.t('trayecto.columnaTren', { lng: lang }),
    columnaOperador: i18n.t('trayecto.columnaOperador', { lng: lang }),
    sinResultados: {
      antes: i18n.t('trayecto.sinResultadosAntes', { lng: lang }),
      entre: i18n.t('trayecto.sinResultadosEntre', { lng: lang }),
      despues: i18n.t('trayecto.sinResultadosDespues', { lng: lang }),
    },
    sinDirectos: (origen, destino) =>
      i18n.t('trayecto.sinDirectos', { lng: lang, origen, destino }),
    transbordoEn: (estacion) => i18n.t('trayecto.transbordoEn', { lng: lang, estacion }),
    espera: (minutos) => i18n.t('trayecto.espera', { lng: lang, minutos }),
    tarjetaTitulo: i18n.t('trayecto.tarjetaTitulo', { lng: lang }),
    tarjetaDescripcion: (directas, conTransbordo, fuente, limite) =>
      i18n.t('trayecto.tarjetaDescripcion', {
        lng: lang,
        directas,
        conTransbordo,
        fuente: fuente ?? 'cache',
        limite,
      }),
    ctaTitulo: (origen, destino) => i18n.t('trayecto.ctaTitulo', { lng: lang, origen, destino }),
    ctaTexto: i18n.t('trayecto.ctaTexto', { lng: lang }),
    ctaBoton: i18n.t('trayecto.ctaBoton', { lng: lang }),
    datosTitulo: i18n.t('trayecto.datosTitulo', { lng: lang }),
    datosOrigen: (fuente) =>
      fuente
        ? i18n.t('trayecto.datosOrigenFuente', { lng: lang, fuente })
        : i18n.t('trayecto.datosOrigen', { lng: lang }),
    datosIndependiente: i18n.t('trayecto.datosIndependiente', { lng: lang }),
    otrosTitulo: i18n.t('trayecto.otrosTitulo', { lng: lang }),
    otrosDescripcion: i18n.t('trayecto.otrosDescripcion', { lng: lang }),
    errorCarga: i18n.t('trayecto.errorCarga', { lng: lang }),
  };
}

function construirTrayectos(lang: Idioma): TextosTrayectos {
  return {
    rutaBase: i18n.t('trayectos.rutaBase', { lng: lang }),
    h1: i18n.t('trayectos.h1', { lng: lang }),
    subtitulo: i18n.t('trayectos.subtitulo', { lng: lang }),
    buscadorTitulo: i18n.t('trayectos.buscadorTitulo', { lng: lang }),
    buscadorDescripcion: i18n.t('trayectos.buscadorDescripcion', { lng: lang }),
    etiquetaOrigen: i18n.t('trayectos.etiquetaOrigen', { lng: lang }),
    etiquetaDestino: i18n.t('trayectos.etiquetaDestino', { lng: lang }),
    botonBuscar: i18n.t('trayectos.botonBuscar', { lng: lang }),
    popularesTitulo: i18n.t('trayectos.popularesTitulo', { lng: lang }),
    popularesDescripcion: (total) => i18n.t('trayectos.popularesDescripcion', { lng: lang, total }),
  };
}

/**
 * Los textos ES se construyen una vez al importar (su diccionario es estático
 * y ya está cargado). Los EN se construyen EN CADA ACCESO: `en.ts` llega bajo
 * demanda y, mientras no lo hace, `i18n.t(..., { lng: 'en' })` cae al
 * fallback ES; construirlos al importar fijaría para siempre los textos ES en
 * `.en`. Cada acceso cuesta un puñado de `t()` (resolución en memoria).
 */
export const TEXTOS_TRAYECTO: Record<Idioma, TextosTrayecto> = {
  es: construirTrayecto('es'),
  get en() {
    return construirTrayecto('en');
  },
};

export const TEXTOS_TRAYECTOS: Record<Idioma, TextosTrayectos> = {
  es: construirTrayectos('es'),
  get en() {
    return construirTrayectos('en');
  },
};

/** Meta tags de la página de detalle de un trayecto, con el hreflang del otro idioma. */
export function metaTrayecto(
  lang: Idioma,
  origen: string,
  destino: string,
  ruta: string,
): MetaPagina {
  const anio = new Date().getFullYear();
  const titulo = i18n.t('meta.trayectoTitulo', { lng: lang, origen, destino, anio });
  const descripcion = i18n.t('meta.trayectoDescripcion', { lng: lang, origen, destino });
  const jsonLd = jsonLdMigas(
    [
      { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
      {
        nombre: i18n.t('pie.navTrayectos', { lng: lang }),
        ruta: lang === 'en' ? '/en/trayectos' : '/trayectos',
      },
      { nombre: `${origen} → ${destino}` },
    ],
    lang,
  );
  if (lang === 'en') {
    return {
      titulo,
      descripcion,
      canonical: ruta,
      lang: 'en',
      alternate: { hreflang: 'es', href: ruta.replace(/^\/en(?=\/|$)/, '') },
      jsonLd,
    };
  }
  return {
    titulo,
    descripcion,
    canonical: ruta,
    lang: 'es',
    alternate: { hreflang: 'en', href: `/en${ruta}` },
    jsonLd,
  };
}

/** Meta tags del listado `/trayectos` (y su gemelo `/en/trayectos`). */
export function metaTrayectos(lang: Idioma): MetaPagina {
  const ruta = lang === 'en' ? '/en/trayectos' : '/trayectos';
  return {
    titulo: i18n.t('meta.trayectosTitulo', { lng: lang }),
    descripcion: i18n.t('meta.trayectosDescripcion', { lng: lang }),
    canonical: ruta,
    lang,
    alternate:
      lang === 'en'
        ? { hreflang: 'es', href: '/trayectos' }
        : { hreflang: 'en', href: '/en/trayectos' },
    jsonLd: jsonLdMigas(
      [
        { nombre: i18n.t('comunes.inicio', { lng: lang }), ruta: '/' },
        { nombre: i18n.t('pie.navTrayectos', { lng: lang }) },
      ],
      lang,
    ),
  };
}
