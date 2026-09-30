import { describe, expect, it } from 'vitest';
import {
  aNextTheme,
  deNextTheme,
  edicionTemaReciente,
  esTemaNext,
  marcarEdicionTema,
} from './tema';

describe('aNextTheme', () => {
  it('traduce el dominio a los valores que entiende next-themes', () => {
    expect(aNextTheme('claro')).toBe('light');
    expect(aNextTheme('oscuro')).toBe('dark');
    expect(aNextTheme('sistema')).toBe('system');
  });

  it('siempre devuelve un valor valido para next-themes', () => {
    expect(esTemaNext(aNextTheme('claro'))).toBe(true);
    expect(esTemaNext(aNextTheme('oscuro'))).toBe(true);
    expect(esTemaNext(aNextTheme('sistema'))).toBe(true);
    expect(aNextTheme('no-es-un-tema')).toBe('system');
    expect(aNextTheme(null)).toBe('system');
    expect(aNextTheme(undefined)).toBe('system');
  });
});

describe('deNextTheme', () => {
  it('traduce light/dark/system al dominio', () => {
    expect(deNextTheme('light')).toBe('claro');
    expect(deNextTheme('dark')).toBe('oscuro');
    expect(deNextTheme('system')).toBe('sistema');
  });

  it('tolera los valores de dominio ya guardados en localStorage', () => {
    expect(deNextTheme('claro')).toBe('claro');
    expect(deNextTheme('oscuro')).toBe('oscuro');
    expect(deNextTheme('sistema')).toBe('sistema');
  });

  it('devuelve sistema ante valores desconocidos', () => {
    expect(deNextTheme('dark-theme')).toBe('sistema');
    expect(deNextTheme('')).toBe('sistema');
    expect(deNextTheme(null)).toBe('sistema');
    expect(deNextTheme(undefined)).toBe('sistema');
  });

  it('es inverso de aNextTheme', () => {
    for (const tema of ['claro', 'oscuro', 'sistema'] as const) {
      expect(deNextTheme(aNextTheme(tema))).toBe(tema);
    }
    for (const tema of ['light', 'dark', 'system'] as const) {
      expect(aNextTheme(deNextTheme(tema))).toBe(tema);
    }
  });
});

describe('edicionTemaReciente', () => {
  it('solo es reciente tras marcar una eleccion', () => {
    expect(edicionTemaReciente()).toBe(false);
    marcarEdicionTema();
    expect(edicionTemaReciente()).toBe(true);
    expect(edicionTemaReciente(0)).toBe(false);
  });
});
