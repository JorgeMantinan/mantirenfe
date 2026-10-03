import { afterEach, describe, expect, it } from 'vitest';
import { cambiarIdioma, i18n } from '@/i18n';
import { construirAlertaVuelta, etiquetaCriterio } from './alertas';

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
