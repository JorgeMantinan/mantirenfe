import { describe, expect, it } from 'vitest';
import { cruzarConexiones, mismoGrupoTransbordo, type TramoHorario } from '../conexiones';

const tramo = (sobrantes: Partial<TramoHorario>): TramoHorario => ({
  numeroTren: 'T1',
  origenNombre: 'Origen',
  destinoNombre: 'Destino',
  origenEstacionId: '60000',
  destinoEstacionId: '17000',
  salida: new Date('2026-09-25T08:00:00Z'),
  llegada: new Date('2026-09-25T10:00:00Z'),
  operador: 'AVE',
  ...sobrantes,
});

describe('mismoGrupoTransbordo', () => {
  it('agrupa estaciones de la misma ciudad', () => {
    expect(mismoGrupoTransbordo('60000', '17000')).toBe(true); // Atocha <-> Chamartín
    expect(mismoGrupoTransbordo('71801', '79400')).toBe(true); // Sants <-> França
    expect(mismoGrupoTransbordo('03216', '65000')).toBe(true); // Sorolla <-> Nord
    expect(mismoGrupoTransbordo('31412', '99143')).toBe(true); // A Coruña
  });

  it('acepta la misma estación exacta', () => {
    expect(mismoGrupoTransbordo('51003', '51003')).toBe(true); // Santa Justa
  });

  it('no mezcla ciudades distintas', () => {
    expect(mismoGrupoTransbordo('60000', '51003')).toBe(false); // Madrid vs Sevilla
    expect(mismoGrupoTransbordo('03216', '35406')).toBe(false); // València vs Valencia de Alcántara
    expect(mismoGrupoTransbordo('65000', '03216')).toBe(true);
    expect(mismoGrupoTransbordo('03216', '35406')).toBe(false);
  });
});

describe('cruzarConexiones', () => {
  const T = (
    n: number,
    salida: string,
    llegada: string,
    origen: string,
    destino: string,
  ): TramoHorario =>
    tramo({
      numeroTren: `T${n}`,
      origenEstacionId: origen,
      destinoEstacionId: destino,
      salida: new Date(salida),
      llegada: new Date(llegada),
    });

  it('conecta A Coruña->Madrid con Madrid->Valencia respetando la espera', () => {
    const salientes = [T(1, '2026-09-25T08:00:00Z', '2026-09-25T11:30:00Z', '31412', '17000')];
    const entrantes = [T(2, '2026-09-25T12:30:00Z', '2026-09-25T15:00:00Z', '60000', '03216')];
    const conexiones = cruzarConexiones(salientes, entrantes);
    expect(conexiones).toHaveLength(1);
    expect(conexiones[0]?.esperaMin).toBe(60);
    expect(conexiones[0]?.primera.numeroTren).toBe('T1');
    expect(conexiones[0]?.segunda.numeroTren).toBe('T2');
  });

  it('descarta esperas demasiado cortas o largas', () => {
    const salientes = [T(1, '2026-09-25T08:00:00Z', '2026-09-25T11:30:00Z', '31412', '17000')];
    const corta = [T(2, '2026-09-25T11:50:00Z', '2026-09-25T15:00:00Z', '60000', '03216')];
    const larga = [T(2, '2026-09-25T20:00:00Z', '2026-09-25T23:00:00Z', '60000', '03216')];
    expect(cruzarConexiones(salientes, corta)).toHaveLength(0);
    expect(cruzarConexiones(salientes, larga)).toHaveLength(0);
  });

  it('elige la conexión de menor espera cuando hay varias', () => {
    const salientes = [T(1, '2026-09-25T08:00:00Z', '2026-09-25T11:30:00Z', '31412', '17000')];
    const entrantes = [
      T(2, '2026-09-25T13:30:00Z', '2026-09-25T16:00:00Z', '60000', '03216'),
      T(3, '2026-09-25T12:45:00Z', '2026-09-25T15:00:00Z', '17000', '03216'),
    ];
    const conexiones = cruzarConexiones(salientes, entrantes);
    expect(conexiones).toHaveLength(1);
    expect(conexiones[0]?.segunda.numeroTren).toBe('T3'); // 75 min < 120 min
    expect(conexiones[0]?.esperaMin).toBe(75);
  });

  it('respeta el límite de conexiones devueltas', () => {
    const salientes = Array.from({ length: 30 }, (_, i) =>
      T(
        i,
        `2026-09-25T0${(i % 8) + 1}:00:00Z`,
        `2026-09-25T${(i % 8) + 3}:30:00Z`,
        '31412',
        '17000',
      ),
    );
    const entrantes = [T(99, '2026-09-25T14:30:00Z', '2026-09-25T17:00:00Z', '60000', '03216')];
    expect(cruzarConexiones(salientes, entrantes, 5)).toHaveLength(5);
  });
});
