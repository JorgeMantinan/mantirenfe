import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RUTAS_PUBLICAS } from '@/rutas-publicas';
import { TRAYECTOS_POPULARES, rutaTrayecto } from '@/lib/trayectos';
import { metaDeRuta } from '@/lib/metas';

const ORIGEN = 'https://mantirenfe.vercel.app';

const vercel = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../vercel.json', import.meta.url)), 'utf8'),
) as { rewrites: Array<{ source: string; destination: string }> };

const sitemap = readFileSync(
  fileURLToPath(new URL('../../public/sitemap.xml', import.meta.url)),
  'utf8',
);

/** URLs concretas que `scripts/prerender.tsx` escribe en `dist/`. */
function urlsPrerenderizadas(): string[] {
  const urls: string[] = [];
  for (const ruta of RUTAS_PUBLICAS) {
    if (!ruta.prerender) continue;
    const lang = ruta.lang ?? 'es';
    if (!ruta.ruta.includes(':')) {
      urls.push(ruta.ruta);
    } else {
      for (const trayecto of TRAYECTOS_POPULARES) urls.push(rutaTrayecto(trayecto, lang));
    }
  }
  return urls;
}

describe('prerender × vercel.json × sitemap', () => {
  it('toda ruta prerenderizada tiene su reescritura en vercel.json', () => {
    const fuentes = new Set(vercel.rewrites.map((rewrite) => rewrite.source));
    // `/` no necesita reescritura: Vercel sirve dist/index.html del sistema
    // de ficheros (que manda sobre las reescrituras).
    const sinRewrite = urlsPrerenderizadas()
      .filter((url) => url !== '/')
      .filter((url) => !fuentes.has(url));
    // Sin esa reescritura, Vercel serviría el index.html de la SPA (vacío
    // para el rastreador) en vez del HTML prerenderizado.
    expect(sinRewrite).toEqual([]);
  });

  it('toda ruta prerenderizada está en el sitemap', () => {
    const ausentes = urlsPrerenderizadas().filter(
      (url) => !sitemap.includes(`<loc>${ORIGEN}${url}</loc>`),
    );
    expect(ausentes).toEqual([]);
  });

  it('las reescrituras de HTML apuntan a rutas prerenderizadas', () => {
    const prerenderizadas = new Set(urlsPrerenderizadas());
    const huerfanas = vercel.rewrites
      // La catch-all de SPA (/(.*) -> /index.html) no es una ruta prerenderizada.
      .filter((rewrite) => !rewrite.source.includes('('))
      .filter(
        (rewrite) => rewrite.destination.startsWith('/') && rewrite.destination.endsWith('.html'),
      )
      .map((rewrite) => rewrite.destination.slice(0, -'.html'.length))
      .filter((destino) => !prerenderizadas.has(destino));
    // Un `.html` al que no se prerenderiza nada sería un 404 de Vercel.
    expect(huerfanas).toEqual([]);
  });

  it('toda página pública de contenido tiene meta propia', () => {
    // `/trayectos*` construye su meta con `metaTrayectos`/`metaTrayecto`.
    const sinMeta = RUTAS_PUBLICAS.filter(
      (ruta) =>
        ruta.prerender &&
        !ruta.ruta.includes(':') &&
        metaDeRuta(ruta.ruta, ruta.lang ?? 'es') === null,
    ).map((ruta) => ruta.ruta);
    expect(sinMeta).toEqual([]);
  });

  it('la catch-all de SPA apunta al cascarón, no a la landing prerenderizada', () => {
    const catchAll = vercel.rewrites.find((rewrite) => rewrite.source === '/(.*)');
    // Si apuntara a /index.html, /mapa, /login o el 404 servirían el HTML de
    // la landing (con su título y su contenido) hasta que React montara.
    expect(catchAll?.destination).toBe('/shell.html');
  });
});
