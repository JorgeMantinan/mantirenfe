import { afterEach, describe, expect, it } from 'vitest';
import { cambiarIdioma, i18n } from '@/i18n';
import { etiquetaCriterio } from './alertas';

const criterios = ['DISPONIBILIDAD', 'HORARIO', 'RETRASO', 'APERTURA_VENTA', 'PRECIO'];

afterEach(async () => {
  await cambiarIdioma('es');
});

describe('etiquetaCriterio', () => {
  it('traduce los cinco criterios en español', async () => {
    await cambiarIdioma('es');
    expect(criterios.map((c) => etiquetaCriterio(i18n.t, c))).toEqual([
      'Plazas libres',
      'Horario',
      'Retraso',
      'Apertura de venta',
      'Precio',
    ]);
  });

  it('traduce los cinco criterios en inglés', async () => {
    await cambiarIdioma('en');
    expect(criterios.map((c) => etiquetaCriterio(i18n.t, c))).toEqual([
      'Seats available',
      'Timetable',
      'Delay',
      'Sales opening',
      'Price',
    ]);
  });

  it('devuelve el código si el criterio no se conoce', () => {
    expect(etiquetaCriterio(i18n.t, 'FUTURO')).toBe('FUTURO');
  });
});
