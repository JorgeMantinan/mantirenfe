/**
 * Prerender de las rutas públicas.
 *
 * La web es una SPA: `index.html` llegaba con un `<div id="root"></div>` vacío
 * y todo el texto se pintaba con JavaScript. Google rastrea con JS, pero
 * AdSense revisa el contenido que encuentra y el HTML «a pelo» del sitio no
 * tenía ni un titular: de ahí el aviso de *contenido de poco valor*.
 *
 * Este script se ejecuta DESPUÉS de `vite build` y, para cada ruta marcada
 * con `prerender: true` en `@/rutas-publicas`, renderiza la página en Node
 * (react-dom/server + MemoryRouter) y escribe el resultado en `dist`:
 *
 *   /trayectos  ->  dist/trayectos.html
 *   /trayectos/madrid/barcelona -> dist/trayectos/madrid/barcelona.html
 *   /           ->  dist/index.html  (se sobrescribe con la landing pintada)
 *
 * `vercel.json` reescribe cada una de esas rutas a su `.html`, que Vercel
 * sirve desde el sistema de ficheros (antes de las reescrituras de SPA).
 * El cliente monta encima con `createRoot`, así que el HTML estático solo lo
 * ven los rastreadores y los navegadores sin JavaScript.
 *
 * El cascarón sin contenido se conserva aparte como `dist/shell.html`, al que
 * apunta la reescritura catch-all: las rutas que no se prerenderizan (mapa,
 * login, panel privado, 404) no deben servir los metadatos de la landing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/layout/AppShell';
import { IdiomaProvider } from '@/i18n/IdiomaProvider';
import { cambiarIdioma, type Idioma } from '@/i18n';
import { RUTAS_PUBLICAS, type RutaPublica } from '@/rutas-publicas';
import { ORIGEN_SITIO } from '@/lib/jsonld';
import { metaDeRuta } from '@/lib/metas';
import { metaTrayecto } from '@/lib/trayectos-i18n';
import { TRAYECTOS_POPULARES, rutaTrayecto, slugATexto } from '@/lib/trayectos';
import type { MetaPagina } from '@/lib/seo';

const CARPETA_WEB = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(CARPETA_WEB, 'dist');
/** Imagen 1200×630 que ven Facebook, WhatsApp y Slack al compartir. */
const OG_IMAGE = `${ORIGEN_SITIO}/og.png`;

interface Objetivo {
  url: string;
  lang: Idioma;
  meta: MetaPagina;
}

/** Meta de una URL concreta: la misma que pinta la página en el cliente. */
function metaDeUrl(objetivo: Omit<Objetivo, 'meta'>): MetaPagina {
  const { url, lang } = objetivo;
  const detalle = url.match(/^\/(en\/)?trayectos\/([^/]+)\/([^/]+)$/);
  if (detalle) {
    const [, prefijo = '', origenSlug = '', destinoSlug = ''] = detalle;
    const semilla = TRAYECTOS_POPULARES.find(
      (t) => t.origenSlug === origenSlug && t.destinoSlug === destinoSlug,
    );
    return metaTrayecto(
      lang,
      semilla?.origenNombre ?? slugATexto(origenSlug),
      semilla?.destinoNombre ?? slugATexto(destinoSlug),
      `${prefijo}trayectos/${origenSlug}/${destinoSlug}`,
    );
  }
  const meta = metaDeRuta(url, lang);
  if (!meta) {
    throw new Error(`La ruta ${url} no tiene meta propia: añádela en src/lib/metas.ts`);
  }
  return meta;
}

/** Todas las URLs concretas a prerenderizar (rutas fijas + trayectos semilla). */
function objetivos(): Objetivo[] {
  const lista: Objetivo[] = [];
  for (const ruta of RUTAS_PUBLICAS) {
    if (!ruta.prerender) continue;
    const lang: Idioma = ruta.lang ?? 'es';
    if (!ruta.ruta.includes(':')) {
      lista.push({ url: ruta.ruta, lang, meta: metaDeUrl({ url: ruta.ruta, lang }) });
      continue;
    }
    for (const trayecto of TRAYECTOS_POPULARES) {
      const url = rutaTrayecto(trayecto, lang);
      lista.push({ url, lang, meta: metaDeUrl({ url, lang }) });
    }
  }
  return lista;
}

/** Árbol de rutas idéntico al de `App.tsx`, pero con las páginas ya cargadas. */
async function arbolDeRutas() {
  const cargadas = new Map(
    await Promise.all(
      RUTAS_PUBLICAS.map(async (ruta) => {
        const modulo = await ruta.cargar();
        return [ruta.ruta, modulo.default] as const;
      }),
    ),
  );

  const pintar = (ruta: RutaPublica) => {
    const Pagina = cargadas.get(ruta.ruta);
    if (!Pagina) throw new Error(`No se pudo cargar la página de ${ruta.ruta}`);
    return <Pagina {...ruta.props} />;
  };

  const sueltas = RUTAS_PUBLICAS.filter((ruta) => !ruta.enPanel).map((ruta) => (
    <Route key={ruta.ruta} path={ruta.ruta} element={pintar(ruta)} />
  ));
  const enPanel = RUTAS_PUBLICAS.filter((ruta) => ruta.enPanel).map((ruta) => (
    <Route key={ruta.ruta} path={ruta.ruta} element={pintar(ruta)} />
  ));

  return (
    <Routes>
      {sueltas}
      <Route element={<AppShell />}>{enPanel}</Route>
    </Routes>
  );
}

/** Serializa los datos estructurados sin poder cerrar el tag desde dentro. */
function jsonLdSerializado(datos: object | object[]): string {
  return JSON.stringify(datos).replace(/</g, '\\u003c');
}

/** Escapa un texto para meterlo dentro de un atributo HTML. */
function atributo(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Etiquetas de `<head>` generadas a partir de la meta de la página. */
function etiquetasHead(meta: MetaPagina, url: string): string {
  const urlAbsoluta = `${ORIGEN_SITIO}${url}`;
  const lang: string = meta.lang ?? 'es';
  const titulo = atributo(meta.titulo);
  const descripcion = atributo(meta.descripcion);
  const lineas = [
    `<title>${titulo}</title>`,
    `<meta name="description" content="${descripcion}" />`,
    `<link rel="canonical" href="${urlAbsoluta}" />`,
  ];
  if (meta.alternate) {
    const href = `${ORIGEN_SITIO}${meta.alternate.href}`;
    lineas.push(`<link rel="alternate" hreflang="${meta.alternate.hreflang}" href="${href}" />`);
    lineas.push(`<link rel="alternate" hreflang="${lang}" href="${urlAbsoluta}" />`);
  }
  lineas.push(
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="MantiRenfe" />`,
    `<meta property="og:locale" content="${lang === 'en' ? 'en_GB' : 'es_ES'}" />`,
    `<meta property="og:title" content="${titulo}" />`,
    `<meta property="og:description" content="${descripcion}" />`,
    `<meta property="og:url" content="${urlAbsoluta}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${titulo}" />`,
    `<meta name="twitter:description" content="${descripcion}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  );
  if (meta.jsonLd) {
    lineas.push(
      `<script type="application/ld+json" id="jsonld-pagina">${jsonLdSerializado(meta.jsonLd)}</script>`,
    );
  }
  return lineas.join('\n    ');
}

/** Quita del template los tags que este script vuelve a escribir. */
function limpiarHead(plantilla: string): string {
  return plantilla
    .replace(/<title>[\s\S]*?<\/title>\s*/g, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/g, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/g, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/g, '');
}

function componerHtml(plantilla: string, meta: MetaPagina, url: string, contenido: string): string {
  const lang = meta.lang ?? 'es';
  const raiz = plantilla
    .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
    .replace('<div id="root"></div>', `<div id="root">${contenido}</div>`);
  const sinTagsViejos = limpiarHead(raiz);
  if (!sinTagsViejos.includes('</head>')) {
    throw new Error('El template de index.html no tiene </head>');
  }
  return sinTagsViejos.replace('</head>', `${etiquetasHead(meta, url)}\n  </head>`);
}

/** Archivo de `dist` que sirve Vercel para la URL (raíz = index.html). */
function destinoDe(url: string): string {
  return url === '/' ? join(DIST, 'index.html') : join(DIST, `${url.slice(1)}.html`);
}

async function main() {
  const plantilla = readFileSync(join(DIST, 'index.html'), 'utf8');
  // El cascarón original (raíz vacía) se conserva para las rutas que no se
  // prerenderizan: la catch-all de vercel.json sirve este, no index.html.
  writeFileSync(join(DIST, 'shell.html'), plantilla, 'utf8');
  // El diccionario EN se carga bajo demanda y aquí hace falta ANTES de
  // construir los meta tags: `i18n.t(..., { lng: 'en' })` con el bundle sin
  // descargar caería al español y el /en/ saldría con título en español.
  await cambiarIdioma('en');
  const arbol = await arbolDeRutas();
  const lista = objetivos();
  const fallos: string[] = [];

  for (const objetivo of lista) {
    try {
      await cambiarIdioma(objetivo.lang);
      const contenido = renderToString(
        <MemoryRouter initialEntries={[objetivo.url]}>
          <IdiomaProvider>
            <Providers>{arbol}</Providers>
          </IdiomaProvider>
        </MemoryRouter>,
      );
      const destino = destinoDe(objetivo.url);
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(
        destino,
        componerHtml(plantilla, objetivo.meta, objetivo.url, contenido),
        'utf8',
      );
    } catch (error) {
      fallos.push(`${objetivo.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (fallos.length > 0) {
    throw new Error(`Prerender incompleto (${fallos.length}):\n  ${fallos.join('\n  ')}`);
  }
  console.log(`Prerender: ${lista.length} páginas escritas en dist/`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
