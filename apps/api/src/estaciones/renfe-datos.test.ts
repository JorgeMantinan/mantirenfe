import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANIO_AFOROS,
  codigoNumerico,
  limpiarCacheDatosRenfe,
  obtenerAforos,
  obtenerFichaOficial,
  parsearAforos,
  parsearFicha,
  RECURSO_AFOROS,
  RECURSO_LISTADO_ESTACIONES,
} from './renfe-datos';

function respuesta(datos: unknown, ok = true): Response {
  return { ok, json: async () => datos } as unknown as Response;
}

function ckan(registros: unknown[]): Response {
  return respuesta({ success: true, result: { records: registros } });
}

const filaZaragoza = {
  CODIGO: 4040,
  DESCRIPCION: 'ZARAGOZA DELICIAS',
  LATITUD: 41.6586576,
  LONGITUD: -0.9112693,
  DIRECION: 'C/ Rioja, 33',
  CP: 50011,
  POBLACION: 'ZARAGOZA',
  PROVINCIA: 'ZARAGOZA',
  PAIS: 'ESPAÑA',
};

const fetchMock = vi.fn();

beforeEach(() => {
  limpiarCacheDatosRenfe();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('codigoNumerico', () => {
  it('quita los ceros a la izquierda que traen los códigos de la BD', () => {
    expect(codigoNumerico('04040')).toBe(4040);
    expect(codigoNumerico(' 51003 ')).toBe(51003);
  });

  it('descarta los códigos que no son numéricos', () => {
    expect(codigoNumerico('es-mad-ato')).toBeNull();
    expect(codigoNumerico('')).toBeNull();
  });
});

describe('parsearFicha', () => {
  it('mapea los campos del listado oficial', () => {
    expect(parsearFicha(filaZaragoza)).toEqual({
      latitud: 41.6586576,
      longitud: -0.9112693,
      direccion: 'C/ Rioja, 33',
      cp: '50011',
      poblacion: 'ZARAGOZA',
      provincia: 'ZARAGOZA',
    });
  });

  it('devuelve null sin fila, y null en los campos vacíos', () => {
    expect(parsearFicha(undefined)).toBeNull();
    expect(parsearFicha({ CODIGO: 1, POBLACION: '   ' })).toEqual({
      latitud: null,
      longitud: null,
      direccion: null,
      cp: null,
      poblacion: null,
      provincia: null,
    });
  });
});

describe('parsearAforos', () => {
  it('ordena por franja, agrega las repetidas y etiqueta el año', () => {
    const aforos = parsearAforos([
      { TRAMO_HORARIO: '07:00 - 07:30', VIAJEROS_SUBIDOS: 192, VIAJEROS_BAJADOS: 500 },
      { TRAMO_HORARIO: '06:00 - 06:30', VIAJEROS_SUBIDOS: 0, VIAJEROS_BAJADOS: 4 },
      // La fuente repite esta franja para Santa Justa: se suman
      { TRAMO_HORARIO: '06:00 - 06:30', VIAJEROS_SUBIDOS: 0, VIAJEROS_BAJADOS: 2 },
    ]);
    expect(aforos).toEqual([
      { franja: '06:00 - 06:30', subidos: 0, bajados: 6, anio: ANIO_AFOROS },
      { franja: '07:00 - 07:30', subidos: 192, bajados: 500, anio: ANIO_AFOROS },
    ]);
  });

  it('ignora las filas sin franja horaria', () => {
    expect(parsearAforos([{ VIAJEROS_SUBIDOS: 5, VIAJEROS_BAJADOS: 5 }])).toEqual([]);
  });
});

describe('obtenerFichaOficial', () => {
  it('consulta por código y cachea el resultado', async () => {
    fetchMock.mockResolvedValueOnce(ckan([filaZaragoza]));

    const ficha = await obtenerFichaOficial('04040', 'Zaragoza Delicias');
    expect(ficha?.direccion).toBe('C/ Rioja, 33');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(`resource_id=${RECURSO_LISTADO_ESTACIONES}`);
    expect(decodeURIComponent(url)).toContain('{"CODIGO":4040}');

    await obtenerFichaOficial('04040', 'Zaragoza Delicias');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('si el código no está, busca por nombre y se queda con la mejor', async () => {
    fetchMock.mockResolvedValueOnce(ckan([])).mockResolvedValueOnce(
      ckan([
        { ...filaZaragoza, CODIGO: 98000, DESCRIPCION: 'MADRID-ATOCHA CERCANIAS' },
        { ...filaZaragoza, CODIGO: 60000, DESCRIPCION: 'MADRID-PUERTA DE ATOCHA' },
      ]),
    );

    const ficha = await obtenerFichaOficial('999999', 'Madrid-Atocha Cercanías');
    expect(ficha?.direccion).toBe('C/ Rioja, 33');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(fetchMock.mock.calls[1]?.[0]))).toContain('q=Madrid');
  });

  it('si el código no es numérico va directo a buscar por nombre', async () => {
    fetchMock.mockResolvedValueOnce(ckan([filaZaragoza]));

    const ficha = await obtenerFichaOficial('es-mad-ato', 'Zaragoza Delicias');
    expect(ficha?.poblacion).toBe('ZARAGOZA');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]))).toContain('q=Zaragoza');
  });

  it('si el CKAN falla devuelve null y reintenta en unos minutos', async () => {
    fetchMock.mockResolvedValueOnce(respuesta({}, false));

    await expect(obtenerFichaOficial('4040', 'Zaragoza')).resolves.toBeNull();
    await expect(obtenerFichaOficial('4040', 'Zaragoza')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nunca lanza aunque la respuesta no sea JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('rotto')) });

    await expect(obtenerFichaOficial('4040', 'Zaragoza')).resolves.toBeNull();
  });
});

describe('obtenerAforos', () => {
  it('devuelve las franjas de 2018 de la estación', async () => {
    fetchMock.mockResolvedValueOnce(
      ckan([
        {
          CODIGO_ESTACION: 4040,
          TRAMO_HORARIO: '08:00 - 08:30',
          VIAJEROS_SUBIDOS: 0,
          VIAJEROS_BAJADOS: 15,
        },
        {
          CODIGO_ESTACION: 4040,
          TRAMO_HORARIO: '07:30 - 08:00',
          VIAJEROS_SUBIDOS: 175,
          VIAJEROS_BAJADOS: 447,
        },
      ]),
    );

    const aforos = await obtenerAforos('4040', 'Zaragoza Delicias');
    expect(aforos?.map((a) => a.franja)).toEqual(['07:30 - 08:00', '08:00 - 08:30']);
    expect(aforos?.every((a) => a.anio === 2018)).toBe(true);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain(`resource_id=${RECURSO_AFOROS}`);
    expect(decodeURIComponent(url)).toContain('{"CODIGO_ESTACION":4040}');
  });

  it('devuelve null cuando la estación no tiene aforos publicados', async () => {
    fetchMock.mockResolvedValueOnce(ckan([])).mockResolvedValueOnce(ckan([]));

    await expect(obtenerAforos('60000', 'Madrid-Puerta de Atocha')).resolves.toBeNull();
  });

  it('devuelve null si el CKAN no responde', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    await expect(obtenerAforos('18000', 'Madrid-Atocha Cercanías')).resolves.toBeNull();
  });
});
