import { afterEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { es } from './es';
import { en } from './en';
import { cambiarIdioma, esRutaTrayecto, i18n, idiomaInicial, rutaEnIdioma } from './index';
import { PaginaNoEncontrada } from '@/pages/not-found';
import {
  TEXTOS_TRAYECTO,
  TEXTOS_TRAYECTOS,
  metaTrayecto,
  metaTrayectos,
} from '@/lib/trayectos-i18n';

/** Ruta completa de cada hoja del diccionario ("comunes.inicio"). */
function hojas(valor: unknown, prefijo = ''): Array<[string, string]> {
  if (typeof valor !== 'object' || valor === null) return [[prefijo, String(valor)]];
  return Object.entries(valor).flatMap(([clave, hijo]) =>
    hojas(hijo, prefijo ? `${prefijo}.${clave}` : clave),
  );
}

const clavesEs = hojas(es).map(([clave]) => clave);
const clavesEn = hojas(en).map(([clave]) => clave);

/** Variables `{{...}}` usadas por una cadena de traducción. */
function variables(texto: string): string[] {
  return [...texto.matchAll(/\{\{(\w+)\}\}/g)].map(([, nombre]) => nombre ?? '').sort();
}

afterEach(async () => {
  await cambiarIdioma('es');
});

describe('diccionarios ES/EN', () => {
  it('tienen exactamente las mismas claves', () => {
    const faltanEn = clavesEs.filter((clave) => !clavesEn.includes(clave));
    const sobranEn = clavesEn.filter((clave) => !clavesEs.includes(clave));
    expect({ faltanEn, sobranEn }).toEqual({ faltanEn: [], sobranEn: [] });
  });

  it('no hay claves vacías ni duplicadas', () => {
    expect(clavesEs.every((clave) => clave.length > 0)).toBe(true);
    expect(new Set(clavesEs).size).toBe(clavesEs.length);
    expect(new Set(clavesEn).size).toBe(clavesEn.length);
  });

  it('usan las mismas variables de interpolación', () => {
    const esMap = new Map(hojas(es));
    const enMap = new Map(hojas(en));
    const descuadres: string[] = [];
    for (const [clave, textoEs] of esMap) {
      const textoEn = enMap.get(clave);
      if (textoEn === undefined) continue;
      const a = variables(textoEs).join(',');
      const b = variables(textoEn).join(',');
      if (a !== b) descuadres.push(`${clave}: ES[${a}] EN[${b}]`);
    }
    expect(descuadres).toEqual([]);
  });

  it('los textos EN no son copias literales del ES (salvo nombres propios)', () => {
    // Sección de la landing que promociona las rutas en inglés: su texto es
    // inglés también en el diccionario ES (solo se pinta en ES, ver landing).
    const inglesPorDiseno = new Set(['landing.inglesTexto']);
    const esMap = new Map(hojas(es));
    const enMap = new Map(hojas(en));
    const iguales: string[] = [];
    for (const [clave, textoEs] of esMap) {
      if (inglesPorDiseno.has(clave)) continue;
      const textoEn = enMap.get(clave);
      if (textoEn !== undefined && textoEs === textoEn && textoEs.length > 60) {
        iguales.push(clave);
      }
    }
    expect(iguales).toEqual([]);
  });
});

describe('traductor', () => {
  it('empieza en español y traduce con el idioma activo', () => {
    expect(idiomaInicial()).toBe('es');
    expect(i18n.language).toBe('es');
    expect(i18n.t('comunes.inicio')).toBe('Inicio');
    expect(i18n.t('trayecto.h1', { origen: 'Madrid', destino: 'Vigo' })).toBe(
      'Horarios de Madrid a Vigo',
    );
  });

  it('cambia de idioma y vuelve', async () => {
    await cambiarIdioma('en');
    expect(i18n.language).toBe('en');
    expect(i18n.t('comunes.inicio')).toBe('Home');
    expect(i18n.t('trayecto.h1', { origen: 'Madrid', destino: 'Vigo' })).toBe(
      'Trains from Madrid to Vigo',
    );

    await cambiarIdioma('es');
    expect(i18n.t('comunes.inicio')).toBe('Inicio');
  });

  it('una clave inexistente no compila ni se resuelve', async () => {
    await cambiarIdioma('en');
    // i18next devuelve la clave si no existe en el recurso
    expect(i18n.exists('comunes.noExiste')).toBe(false);
    expect(i18n.exists('comunes.inicio')).toBe(true);
  });

  it('renderiza una página en el idioma activo', async () => {
    const pintar = (): string =>
      renderToString(
        <MemoryRouter>
          <PaginaNoEncontrada />
        </MemoryRouter>,
      );

    await cambiarIdioma('es');
    expect(pintar()).toContain('Estación no encontrada');

    await cambiarIdioma('en');
    expect(pintar()).toContain('Station not found');
    expect(pintar()).toContain('Back to home');
  });
});

describe('rutas bilingües', () => {
  it('reconoce y convierte las rutas de trayecto', () => {
    expect(esRutaTrayecto('/trayectos')).toBe(true);
    expect(esRutaTrayecto('/en/trayectos/madrid/vigo')).toBe(true);
    expect(esRutaTrayecto('/mapa')).toBe(false);
    expect(rutaEnIdioma('/trayectos/madrid/vigo', 'en')).toBe('/en/trayectos/madrid/vigo');
    expect(rutaEnIdioma('/en/trayectos', 'es')).toBe('/trayectos');
  });
});

describe('fachada de trayectos sobre i18n', () => {
  it('expone los textos SEO en los dos idiomas', () => {
    expect(TEXTOS_TRAYECTO.es.rutaBase).toBe('/trayectos');
    expect(TEXTOS_TRAYECTO.en.rutaBase).toBe('/en/trayectos');
    expect(TEXTOS_TRAYECTO.es.h1('A Coruña', 'Vigo')).toBe('Horarios de A Coruña a Vigo');
    expect(TEXTOS_TRAYECTO.en.h1('A Coruña', 'Vigo')).toBe('Trains from A Coruña to Vigo');
    expect(TEXTOS_TRAYECTO.en.tarjetaDescripcion(2, 1, null, 10)).toContain('source: cache');
    expect(TEXTOS_TRAYECTOS.en.h1).toBe('Train schedules by route');
    expect(TEXTOS_TRAYECTOS.en.popularesTitulo).toBe('Popular routes');
    expect(TEXTOS_TRAYECTOS.es.popularesDescripcion(15)).toContain('15 trayectos');
  });

  it('construye los meta tags con hreflang', () => {
    const anio = new Date().getFullYear();
    const en = metaTrayecto('en', 'A Coruña', 'Vigo', '/en/trayectos/a-coruna/vigo');
    expect(en.titulo).toBe(`Trains from A Coruña to Vigo – timetable ${anio} | MantiRenfe`);
    expect(en.lang).toBe('en');
    expect(en.alternate).toEqual({ hreflang: 'es', href: '/trayectos/a-coruna/vigo' });

    expect(metaTrayecto('es', 'A', 'B', '/trayectos/a/b').alternate).toEqual({
      hreflang: 'en',
      href: '/en/trayectos/a/b',
    });
    expect(metaTrayectos('en').alternate).toEqual({ hreflang: 'es', href: '/trayectos' });
    expect(metaTrayectos('es').canonical).toBe('/trayectos');
  });
});
