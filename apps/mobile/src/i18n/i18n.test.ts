import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { es } from './es';
import { en } from './en';
import { cambiarIdioma, i18n, idiomaDesdeLocale, idiomaInicial, locale, t } from './index';

/** Ruta completa de cada hoja del diccionario ("comunes.error"). */
function hojas(valor: unknown, prefijo = ''): Array<[string, string]> {
  if (typeof valor !== 'object' || valor === null) return [[prefijo, String(valor)]];
  return Object.entries(valor).flatMap(([clave, hijo]) =>
    hojas(hijo, prefijo ? `${prefijo}.${clave}` : clave),
  );
}

/** Variables `{{...}}` usadas por una cadena de traducción. */
function variables(texto: string): string[] {
  return [...texto.matchAll(/\{\{(\w+)\}\}/g)].map(([, nombre]) => nombre ?? '').sort();
}

const clavesEs = hojas(es).map(([clave]) => clave);
const clavesEn = hojas(en).map(([clave]) => clave);

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
});

describe('idiomaDesdeLocale', () => {
  it('mapea locales del sistema a es/en', () => {
    expect(idiomaDesdeLocale('es-ES')).toBe('es');
    expect(idiomaDesdeLocale('es-AR')).toBe('es');
    expect(idiomaDesdeLocale('fr-FR')).toBe('es');
    expect(idiomaDesdeLocale('en-US')).toBe('en');
    expect(idiomaDesdeLocale('en-GB')).toBe('en');
    expect(idiomaDesdeLocale(null)).toBe('es');
    expect(idiomaDesdeLocale(undefined)).toBe('es');
  });
});

describe('traductor', () => {
  // Fija el idioma: el arranque de i18n depende del locale del entorno
  // (en CI el runner es en-US → 'en'), no del valor de los tests.
  beforeEach(async () => {
    await cambiarIdioma('es');
  });

  it('arranca con el idioma del entorno y traduce con el activo', async () => {
    expect(['es', 'en']).toContain(idiomaInicial());
    expect(i18n.language).toBe('es');
    expect(t('comunes.error')).toBe('Error');
    expect(t('pestanas.ajustes')).toBe('Ajustes');
    expect(locale()).toBe('es-ES');
  });

  it('interpola variables en el idioma activo', async () => {
    expect(t('lista.metaAlerta', { fecha: '2026-10-01', min: 10, bono: 'GENERAL' })).toBe(
      '2026-10-01 · cada 10 min · GENERAL',
    );

    await cambiarIdioma('en');
    expect(t('lista.metaAlerta', { fecha: '2026-10-01', min: 10, bono: 'GENERAL' })).toBe(
      '2026-10-01 · every 10 min · GENERAL',
    );
    expect(t('viaje.titulo')).toBe('Your next trip');
  });

  it('cambia de idioma y vuelve', async () => {
    await cambiarIdioma('en');
    expect(i18n.language).toBe('en');
    expect(t('pestanas.ajustes')).toBe('Settings');
    expect(locale()).toBe('en-GB');

    await cambiarIdioma('es');
    expect(t('pestanas.ajustes')).toBe('Ajustes');
    expect(locale()).toBe('es-ES');
  });

  it('una clave inexistente no se resuelve', () => {
    expect(i18n.exists('comunes.noExiste')).toBe(false);
    expect(i18n.exists('comunes.error')).toBe(true);
  });
});
