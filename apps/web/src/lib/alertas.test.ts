import { afterEach, describe, expect, it } from 'vitest';
import { cambiarIdioma, i18n } from '@/i18n';
import { construirAlertaVuelta, etiquetaCriterio, etiquetaDiasSemana } from './alertas';

const criterios = ['DISPONIBILIDAD', 'HORARIO', 'RETRASO', 'APERTURA_VENTA', 'PRECIO'];

const payloadIda = {
  origenNombre: 'Madrid-Atocha',
  destinoNombre: 'Barcelona-Sants',
  fechaViaje: '2026-11-02',
  recurrente: false,
  soloLaborables: false,
  horaDesde: '08:00',
  horaHasta: null,
  numeroTren: '03311',
  criterio: 'PRECIO',
  precioObjetivo: 45,
  intervaloSondeoMin: 15,
  bono: 'BONO_10',
  notas: 'Solo clase Turista',
} as const;

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

describe('construirAlertaVuelta', () => {
  it('invierte origen y destino', () => {
    const vuelta = construirAlertaVuelta(payloadIda);
    expect(vuelta.origenNombre).toBe('Barcelona-Sants');
    expect(vuelta.destinoNombre).toBe('Madrid-Atocha');
  });

  it('conserva fecha, criterio, franja, intervalo, bono, tren y notas', () => {
    const { origenNombre, destinoNombre, ...resto } = payloadIda;
    expect(construirAlertaVuelta(payloadIda)).toEqual({
      ...resto,
      origenNombre: destinoNombre,
      destinoNombre: origenNombre,
    });
  });

  it('no muta el payload de la ida', () => {
    construirAlertaVuelta(payloadIda);
    expect(payloadIda.origenNombre).toBe('Madrid-Atocha');
    expect(payloadIda.destinoNombre).toBe('Barcelona-Sants');
  });
});

describe('etiquetaDiasSemana (badge de frecuencia)', () => {
  it('sin días marcados (o con los7) dice «Cada día»', async () => {
    await cambiarIdioma('es');
    expect(etiquetaDiasSemana(i18n.t, [])).toBe('Cada día');
    expect(etiquetaDiasSemana(i18n.t, [0, 1, 2, 3, 4, 5, 6])).toBe('Cada día');

    await cambiarIdioma('en');
    expect(etiquetaDiasSemana(i18n.t, [])).toBe('Every day');
  });

  it('los laborables se resumen como «L-V»', async () => {
    await cambiarIdioma('es');
    expect(etiquetaDiasSemana(i18n.t, [1, 2, 3, 4, 5])).toBe('L-V');

    await cambiarIdioma('en');
    expect(etiquetaDiasSemana(i18n.t, [1, 2, 3, 4, 5])).toBe('Mon–Fri');
  });

  it('un solo día usa su nombre corto', async () => {
    await cambiarIdioma('es');
    expect(etiquetaDiasSemana(i18n.t, [4])).toBe('Jue');
    expect(etiquetaDiasSemana(i18n.t, [0])).toBe('Dom');

    await cambiarIdioma('en');
    expect(etiquetaDiasSemana(i18n.t, [4])).toBe('Thu');
  });

  it('varios días usa las iniciales en orden de semana', async () => {
    await cambiarIdioma('es');
    expect(etiquetaDiasSemana(i18n.t, [5, 1, 3])).toBe('L, X, V');
    // El orden y la deduplicación no dependen de cómo vengan
    expect(etiquetaDiasSemana(i18n.t, [5, 1, 5, 3])).toBe('L, X, V');

    await cambiarIdioma('en');
    expect(etiquetaDiasSemana(i18n.t, [5, 1, 3])).toBe('M, W, F');
  });

  it('ignora días fuera de rango', async () => {
    await cambiarIdioma('es');
    expect(etiquetaDiasSemana(i18n.t, [9, -1, 4])).toBe('Jue');
    expect(etiquetaDiasSemana(i18n.t, [9, -1])).toBe('Cada día');
  });
});
