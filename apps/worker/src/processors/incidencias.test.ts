import { describe, expect, it } from 'vitest';
import {
  cuerpoAvisoIncidencia,
  debeAvisarIncidencia,
  incidenciaYaAvisada,
  LIMITE_INCIDENCIAS_POR_BARRIDO,
  planificarAvisosDeIncidencias,
  sinCambios,
  TITULO_AVISO_INCIDENCIA,
  type AlertaCandidata,
  type IncidenciaNotificable,
} from './incidencias';

describe('sinCambios (escrituras de Incidencia)', () => {
  const base = {
    titulo: 'Retrasos en la línea',
    mensaje: 'Circulación lenta entre Madrid y Sevilla',
    causa: 'Obras',
    estacionesAfectadas: ['Sevilla', 'Córdoba'],
    desde: new Date('2026-10-26T08:00:00Z'),
    hasta: new Date('2026-10-26T12:00:00Z'),
  };

  it('no reescribe si el contenido es idéntico y sigue activa', () => {
    expect(sinCambios({ ...base, activa: true }, { ...base })).toBe(true);
  });

  it('reescribe si algún campo del feed ha cambiado', () => {
    expect(sinCambios({ ...base, activa: true }, { ...base, hasta: null })).toBe(false);
    expect(sinCambios({ ...base, activa: true }, { ...base, causa: null })).toBe(false);
    expect(
      sinCambios({ ...base, activa: true }, { ...base, estacionesAfectadas: ['Sevilla'] }),
    ).toBe(false);
  });

  it('reescribe si la fila estaba inactiva (hay que reactivarla)', () => {
    expect(sinCambios({ ...base, activa: false }, { ...base })).toBe(false);
  });
});

function incidencia(id: string, datos: Partial<IncidenciaNotificable> = {}): IncidenciaNotificable {
  return {
    id,
    titulo: null,
    mensaje: null,
    estacionesAfectadas: [],
    ...datos,
  };
}

function alerta(
  id: string,
  origenNombre: string,
  destinoNombre: string,
  incidenciasNotificadas: string[] = [],
): AlertaCandidata {
  return { id, origenNombre, destinoNombre, incidenciasNotificadas };
}

describe('debeAvisarIncidencia (match incidencia ↔ alerta)', () => {
  it('afecta cuando la estación está en el origen o en el destino', () => {
    const inc = incidencia('INC_1', { estacionesAfectadas: ['Majadahonda'] });
    expect(debeAvisarIncidencia(inc, alerta('a1', 'Majadahonda', 'Las Rozas'))).toBe(true);
    expect(debeAvisarIncidencia(inc, alerta('a2', 'Las Rozas', 'Majadahonda'))).toBe(true);
    expect(debeAvisarIncidencia(inc, alerta('a3', 'Las Rozas', 'Colmenar Viejo'))).toBe(false);
  });

  it('normaliza tildes, guiones y artículos iniciales', () => {
    const corunha = incidencia('INC_2', { estacionesAfectadas: ['La Coruña'] });
    expect(debeAvisarIncidencia(corunha, alerta('a1', 'A Coruña', 'Madrid'))).toBe(true);

    const chamartin = incidencia('INC_3', { estacionesAfectadas: ['Madrid-Chamartín'] });
    expect(debeAvisarIncidencia(chamartin, alerta('a2', 'Madrid Chamartín', 'Segovia'))).toBe(true);
  });

  it('empareja por el mensaje cuando no hay estación resuelta', () => {
    const inc = incidencia('INC_4', {
      mensaje:
        'Por obras en la línea C-9 el servicio está suspendido entre Cercedilla y Los Cotos.',
    });
    expect(debeAvisarIncidencia(inc, alerta('a1', 'Cercedilla', 'Madrid'))).toBe(true);
    expect(debeAvisarIncidencia(inc, alerta('a2', 'Atocha', 'Cercedilla'))).toBe(true);
    expect(debeAvisarIncidencia(inc, alerta('a3', 'Atocha', 'Sol'))).toBe(false);
  });
});

describe('incidenciaYaAvisada (dedupe)', () => {
  const inc = incidencia('INC_1', { estacionesAfectadas: ['Majadahonda'] });

  it('detecta el par ya notificado y no vuelve a avisar', () => {
    const yaAvisada = alerta('a1', 'Majadahonda', 'Las Rozas', ['INC_1']);
    expect(incidenciaYaAvisada(inc, yaAvisada)).toBe(true);
    expect(debeAvisarIncidencia(inc, yaAvisada)).toBe(false);
  });

  it('solo descarta la incidencia avisada, no otras de la misma estación', () => {
    const otra = alerta('a2', 'Majadahonda', 'Las Rozas', ['INC_9']);
    expect(incidenciaYaAvisada(inc, otra)).toBe(false);
    expect(debeAvisarIncidencia(inc, otra)).toBe(true);
  });
});

describe('planificarAvisosDeIncidencias', () => {
  const estacion = (n: number) =>
    incidencia(`INC_${n}`, { estacionesAfectadas: [`Estación ${n}`] });
  const ruta = alerta('a1', 'Estación 1', 'Estación 2');

  it('devuelve la incidencia con sus alertas pendientes', () => {
    const plan = planificarAvisosDeIncidencias([estacion(1)], [ruta]);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.incidencia.id).toBe('INC_1');
    expect(plan[0]?.alertas.map((a) => a.id)).toEqual(['a1']);
  });

  it('no incluye incidencias sin match ni las ya notificadas', () => {
    const sinMatch = incidencia('INC_2', { estacionesAfectadas: ['Sevilla'] });
    const yaAvisada = incidencia('INC_3', { estacionesAfectadas: ['Estación 1'] });
    const plan = planificarAvisosDeIncidencias(
      [sinMatch, yaAvisada],
      [{ ...ruta, incidenciasNotificadas: ['INC_3'] }],
    );
    expect(plan).toEqual([]);
  });

  it('corta en el límite de incidencias por barrido', () => {
    const muchas = Array.from({ length: LIMITE_INCIDENCIAS_POR_BARRIDO + 2 }, (_, i) =>
      incidencia(`INC_${i}`, { estacionesAfectadas: ['Estación 1'] }),
    );
    const plan = planificarAvisosDeIncidencias(muchas, [ruta]);
    expect(plan).toHaveLength(LIMITE_INCIDENCIAS_POR_BARRIDO);
    expect(plan.map((p) => p.incidencia.id)).toEqual(['INC_0', 'INC_1', 'INC_2', 'INC_3', 'INC_4']);
  });

  it('una incidencia sin match no consume el límite', () => {
    const sinMatch = incidencia('INC_x', { estacionesAfectadas: ['Sevilla'] });
    const aviso = estacion(1);
    const plan = planificarAvisosDeIncidencias([sinMatch, sinMatch, aviso], [ruta], 1);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.incidencia.id).toBe('INC_1');
  });

  it('avisa a todas las alertas afectadas de la incidencia', () => {
    const inc = incidencia('INC_1', { estacionesAfectadas: ['Majadahonda'] });
    const plan = planificarAvisosDeIncidencias(
      [inc],
      [
        alerta('a1', 'Majadahonda', 'Las Rozas'),
        alerta('a2', 'Las Rozas', 'Majadahonda'),
        alerta('a3', 'Las Rozas', 'Colmenar Viejo'),
      ],
    );
    expect(plan[0]?.alertas.map((a) => a.id)).toEqual(['a1', 'a2']);
  });
});

describe('cuerpoAvisoIncidencia', () => {
  it('resume la incidencia y cita la ruta del usuario', () => {
    const inc = incidencia('INC_1', {
      titulo: 'Retrasos en la línea C-9',
      mensaje: 'Servicio suspendido por incidencia en la vía.',
      estacionesAfectadas: ['Cercedilla'],
    });
    const cuerpo = cuerpoAvisoIncidencia(inc, alerta('a1', 'Cercedilla', 'Madrid'));
    expect(cuerpo).toContain('Servicio suspendido por incidencia en la vía.');
    expect(cuerpo).toContain('Cercedilla → Madrid');
    expect(TITULO_AVISO_INCIDENCIA).toBe('Incidencia en tu ruta');
  });

  it('usa el título si no hay mensaje y un texto genérico si no hay nada', () => {
    const conTitulo = incidencia('INC_2', { titulo: 'Aviso de obra' });
    expect(cuerpoAvisoIncidencia(conTitulo, alerta('a1', 'A', 'B'))).toContain('Aviso de obra');
    const vacia = incidencia('INC_3');
    expect(cuerpoAvisoIncidencia(vacia, alerta('a1', 'A', 'B'))).toContain(
      'Incidencia de servicio',
    );
  });
});
