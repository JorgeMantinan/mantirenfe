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

import { describe, expect, it } from 'vitest';
import { cruzarConexiones, mismoGrupoTransbordo, type TramoHorario } from '../conexiones';

/**
 * Datos reales de producción (BD, 2026-09-28) para la consulta
 * `GET /api/trenes/horarios?origen=A Coruña&destino=Vilagarcía de Arousa`:
 * la API responde200 con `trenes: []` aunque Renfe vende ese trayecto (DWR).
 *
 * El cuello de botella NO es la ventana de espera: a Vilagarcía (23008) solo
 * llegan dos trenes, ambos con origen en Santiago (31400) a las11:00 y19:10,
 * y el único servicio de A Coruña que TERMINA en Santiago llega a las22:46.
 * Por mucho que se amplíe la espera mínima/máxima, no hay pareja posible.
 */
const REALES_SALIENTES: Array<[string, string, string, string]> = [
  ['34154', '05:14', '06:21', '22100'], // Ourense
  ['04154', '05:14', '08:49', '17000'], // Madrid-Chamartín
  ['12411', '05:30', '07:41', '22308'], // Vigo-Guixar
  ['09061', '06:00', '07:13', '22100'],
  ['09073', '07:00', '08:40', '08223'], // Vigo Urzaiz
  ['12644', '07:05', '10:49', '22100'],
  ['34364', '07:10', '08:17', '22100'],
  ['04364', '07:10', '10:45', '17000'],
  ['12680', '07:30', '08:48', '21010'], // Ferrol
  ['09071', '07:45', '08:56', '22100'],
  ['09083', '08:00', '09:27', '08223'],
  ['09093', '09:00', '10:27', '08223'],
  ['12421', '09:35', '11:53', '22308'],
  ['09101', '10:00', '11:13', '22100'],
  ['09113', '10:50', '12:18', '08223'],
  ['04314', '11:15', '14:50', '17000'],
  ['09123', '12:00', '13:27', '08223'],
  ['12682', '12:40', '13:58', '21010'],
  ['12453', '12:45', '15:00', '22308'],
  ['09131', '13:35', '14:48', '22100'],
  ['09143', '14:05', '15:42', '08223'],
  ['09153', '15:00', '16:27', '08223'],
  ['12684', '15:04', '16:20', '21010'],
  ['09351', '15:08', '16:21', '22100'],
  ['12431', '15:39', '17:54', '22308'],
  ['34334', '15:54', '17:01', '22100'],
  ['04334', '15:54', '19:51', '17000'],
  ['09173', '17:00', '18:27', '08223'],
  ['09171', '17:15', '18:28', '22100'],
  ['09183', '18:00', '19:26', '08223'],
  ['12690', '18:32', '19:49', '21010'],
  ['12441', '19:08', '21:31', '22308'],
  ['34404', '19:33', '20:40', '22100'],
  ['04404', '19:33', '23:07', '17000'],
  ['12642', '19:35', '22:26', '20300'], // Monforte de Lemos
  ['09201', '21:00', '22:13', '22100'],
  ['09213', '21:40', '23:23', '08223'],
  ['12561', '22:10', '22:46', '31400'], // único que termina en Santiago
  ['12692', '23:05', '00:12', '21010'], // cruza la medianoche
];

/** Únicos trenes que llegan a Vilagarcía de Arousa ese día (desde Santiago). */
const REALES_ENTRANTES: Array<[string, string, string, string]> = [
  ['12451', '11:00', '11:37', '31400'],
  ['12457', '19:10', '19:50', '31400'],
];

function real(
  [numeroTren, salida, llegada, estacion]: [string, string, string, string],
  esSaliente: boolean,
): TramoHorario {
  const iso = (hora: string, masUnDia = false): Date =>
    new Date(Date.parse(`2026-09-28T${hora}:00Z`) + (masUnDia ? 86_400_000 : 0));
  const llegaCruzada = llegada <= salida;
  const base = {
    numeroTren,
    origenNombre: esSaliente ? 'A Coruña' : 'Santiago de Compostela',
    destinoNombre: esSaliente ? 'destino' : 'Vilagarcía de Arousa',
    salida: iso(salida),
    llegada: iso(llegada, llegaCruzada),
    operador: null,
  };
  return esSaliente
    ? { ...base, origenEstacionId: '31412', destinoEstacionId: estacion }
    : { ...base, origenEstacionId: estacion, destinoEstacionId: '23008' };
}

describe('cruzarConexiones con datos reales: A Coruña -> Vilagarcía (2026-09-28)', () => {
  const salientes = REALES_SALIENTES.map((f) => real(f, true));
  const entrantes = REALES_ENTRANTES.map((f) => real(f, false));

  it('no encuentra ninguna conexión con la ventana actual', () => {
    expect(salientes).toHaveLength(39);
    expect(entrantes).toHaveLength(2);
    expect(cruzarConexiones(salientes, entrantes)).toHaveLength(0);
  });

  it('el problema no es la espera: el único tren a Santiago llega cuando ya no hay más', () => {
    // Solo el12561 termina en Santiago (31400), y llega a las22:46...
    const aSantiago = salientes.filter((s) => mismoGrupoTransbordo(s.destinoEstacionId, '31400'));
    expect(aSantiago.map((s) => s.numeroTren)).toEqual(['12561']);
    expect(aSantiago[0]?.llegada.toISOString()).toBe('2026-09-28T22:46:00.000Z');

    // ...mientras que los dos trenes a Vilagarcía salen a las11:00 y19:10,
    // es decir, antes de que llegue: la espera resultante sería negativa.
    for (const segunda of entrantes) {
      expect(segunda.salida.getTime()).toBeLessThan(aSantiago[0]!.llegada.getTime());
      expect(cruzarConexiones([aSantiago[0]!], [segunda])).toHaveLength(0);
    }

    // Ninguna otra salida de A Coruña enlaza con el origen de los trenes a
    // Vilagarcía (Santiago): terminan en Vigo, Ourense, Madrid, Ferrol...
    const enlazan = salientes.filter((s) =>
      mismoGrupoTransbordo(s.destinoEstacionId, entrantes[0]!.origenEstacionId),
    );
    expect(enlazan).toHaveLength(1);
  });
});
