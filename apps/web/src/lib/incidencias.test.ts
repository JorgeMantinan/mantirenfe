import { describe, expect, it } from 'vitest';
import { formatoPeriodo, incidenciaAfectaA, type IncidenciaResponse } from './incidencias';

function incidencia(datos: Partial<IncidenciaResponse>): IncidenciaResponse {
  return {
    id: 'INFO_1',
    titulo: null,
    mensaje: null,
    causa: null,
    estacionesAfectadas: [],
    desde: null,
    hasta: null,
    activa: true,
    actualizadaEn: '2026-09-27T10:00:00.000Z',
    ...datos,
  };
}

describe('incidenciaAfectaA', () => {
  it('detecta la estación afectada por nombre exacto normalizado', () => {
    const inc = incidencia({ estacionesAfectadas: ['Majadahonda'] });
    expect(incidenciaAfectaA(inc, ['Majadahonda'])).toBe(true);
    expect(incidenciaAfectaA(inc, ['majadahonda'])).toBe(true);
    expect(incidenciaAfectaA(inc, ['Las Rozas'])).toBe(false);
  });

  it('ignora tildes, guiones y artículos iniciales', () => {
    const inc = incidencia({ estacionesAfectadas: ['La Coruña'] });
    expect(incidenciaAfectaA(inc, ['A Coruña'])).toBe(true);
    expect(incidenciaAfectaA(inc, ['Coruña'])).toBe(true);

    const chamartin = incidencia({ estacionesAfectadas: ['Madrid-Chamartín'] });
    expect(incidenciaAfectaA(chamartin, ['Madrid Chamartín'])).toBe(true);
  });

  it('empareja por el mensaje cuando no hay estación resuelta', () => {
    const inc = incidencia({
      mensaje:
        'Por obras en la línea C-9 el servicio está suspendido entre Cercedilla y Los Cotos.',
    });
    expect(incidenciaAfectaA(inc, ['Cercedilla'])).toBe(true);
    expect(incidenciaAfectaA(inc, ['Los Cotos'])).toBe(true);
    expect(incidenciaAfectaA(inc, ['Atocha'])).toBe(false);
  });

  it('no confunde palabras que solo contienen el nombre', () => {
    const inc = incidencia({ mensaje: 'Se suspende el servicio por la noche' });
    expect(incidenciaAfectaA(inc, ['Sol'])).toBe(false);
  });

  it('tolera nombres compuestos con palabras sueltas', () => {
    const inc = incidencia({ estacionesAfectadas: ['Madrid-Puerto de Atocha'] });
    expect(incidenciaAfectaA(inc, ['Madrid Atocha'])).toBe(true);
    expect(incidenciaAfectaA(inc, ['Sevilla Santa Justa'])).toBe(false);
  });

  it('ignora estaciones vacías o demasiado cortas', () => {
    const inc = incidencia({ estacionesAfectadas: ['Majadahonda'] });
    expect(incidenciaAfectaA(inc, [null, undefined, ''])).toBe(false);
  });
});

describe('formatoPeriodo', () => {
  const desde = '2026-09-27T10:00:00.000Z';
  const hasta = '2026-09-28T10:00:00.000Z';

  it('formatea inicio y fin, solo inicio o nada', () => {
    expect(formatoPeriodo(desde, hasta)).toContain(' – ');
    expect(formatoPeriodo(desde, null)).toMatch(/^Desde el /);
    expect(formatoPeriodo(null, hasta)).toMatch(/^Hasta el /);
    expect(formatoPeriodo(null, null)).toBe('Periodo no indicado');
  });
});
