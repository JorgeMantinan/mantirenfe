import { describe, expect, it } from 'vitest';
import {
  coincideNumeroTren,
  conCache,
  deduplicarTrenes,
  disponibleSegunReglas,
  extraerListaTrenes,
  mapearTrenesVenta,
  tarifaMasBarata,
  type TrenVenta,
} from './renfe-dwr';

describe('conCache', () => {
  it('calcula una sola vez dentro del TTL y recalcula al caducar', async () => {
    const cache = new Map<string, { valor: number; caduca: number }>();
    let calculos = 0;
    const calcular = async () => ++calculos;

    expect(await conCache(cache, 'a', 60_000, calcular)).toBe(1);
    expect(await conCache(cache, 'a', 60_000, calcular)).toBe(1);
    expect(calculos).toBe(1);

    const entrada = cache.get('a');
    if (entrada) entrada.caduca = Date.now() - 1;
    expect(await conCache(cache, 'a', 60_000, calcular)).toBe(2);
    expect(calculos).toBe(2);
  });

  it('no comparte entradas entre claves distintas', async () => {
    const cache = new Map<string, { valor: string; caduca: number }>();
    expect(await conCache(cache, 'x', 60_000, async () => 'uno')).toBe('uno');
    expect(await conCache(cache, 'y', 60_000, async () => 'dos')).toBe('dos');
    expect(cache.size).toBe(2);
  });
});

describe('disponibleSegunReglas', () => {
  const base = {
    completo: false,
    razonNoDisponible: null,
    tarifaMinima: '45,50',
    soloPlazaH: false,
  };

  it('disponible con tren no completo, sin bloqueos y con tarifa', () => {
    expect(disponibleSegunReglas(base)).toBe(true);
    expect(disponibleSegunReglas({ ...base, razonNoDisponible: '8' })).toBe(true);
  });

  it('no disponible si está completo, solo plazas H, sin tarifa o con bloqueo', () => {
    expect(disponibleSegunReglas({ ...base, completo: true })).toBe(false);
    expect(disponibleSegunReglas({ ...base, soloPlazaH: true })).toBe(false);
    expect(disponibleSegunReglas({ ...base, tarifaMinima: null })).toBe(false);
    expect(disponibleSegunReglas({ ...base, tarifaMinima: undefined })).toBe(false);
    expect(disponibleSegunReglas({ ...base, razonNoDisponible: '2' })).toBe(false);
  });

  it('no disponible si faltan las banderas (defaults del original)', () => {
    expect(disponibleSegunReglas({ tarifaMinima: '10' })).toBe(false);
  });
});

describe('extraerListaTrenes', () => {
  it('extrae y parsea el objeto del callback DWR (JSON5: claves sin comillas)', () => {
    const texto =
      "throw 'allowScriptTagRemoting is false.'; (function(){ var r=window.dwr._[0]; " +
      'r.handleCallback("3","0",{listadoTrenes:[{listviajeViewEnlaceBean:' +
      '[{horaSalida:"06:27:00",tarifaMinima:"99.6",completo:false,soloPlazaH:false}]}]});' +
      ' //#DWR-INSERT })();';
    const datos = extraerListaTrenes(texto);
    const tren = datos.listadoTrenes?.[0]?.listviajeViewEnlaceBean?.[0];
    expect(tren?.horaSalida).toBe('06:27:00');
    expect(tren?.tarifaMinima).toBe('99.6');
    expect(disponibleSegunReglas(tren!)).toBe(true);
  });

  it('lanza si no hay callback', () => {
    expect(() => extraerListaTrenes('respuesta sin datos')).toThrow('No se pudo extraer');
  });
});

const CODIGOS = { origen: '31412', destino: '08223' };
const FECHA = '2026-10-05';

/** Fila real del listado DWR A Coruña → Vigo (directa, AVLO). */
const directa: TrenVenta = {
  directo: true,
  fecha: FECHA,
  horaSalida: '19:33:00',
  horaLlegada: '23:07:00',
  tarifaMinima: '40,7',
  duracionViajeTotalEnMinutos: 214,
  tipoTrenUno: 'AVE',
  completo: false,
  razonNoDisponible: '',
  soloPlazaH: false,
  tarifasDisponibles: [
    { titulo: 'Básico', precioTarifa: '40,7' },
    { titulo: 'Elige', precioTarifa: '55,0' },
  ],
  trayectos: [
    {
      cdgoTren: '04404',
      fecha: FECHA,
      tipoTren: 'AVE',
      descripcionEstacionOrigen: 'A CORUÑA',
      descripcionEstacionDestino: 'VIGO URZAIZ',
      horaSalida: '19:33:00',
      horaLlegada: '23:07:00',
    },
  ],
};

/** Conexión 09201 (AVANT A Coruña→Santiago) + 00622 (ALVIA Santiago→Vigo). */
const conexionAlvia: TrenVenta = {
  directo: false,
  fecha: FECHA,
  horaSalida: '21:00:00',
  horaLlegada: '22:57:00',
  tarifaMinima: '12,9',
  duracionViajeTotalEnMinutos: 117,
  tipoTrenUno: 'AVANT',
  tipoTrenDos: 'ALVIA',
  completo: false,
  razonNoDisponible: '8',
  soloPlazaH: false,
  tarifasDisponibles: [
    { titulo: 'Básico', precioTarifa: '12,9' },
    { titulo: 'Elige', precioTarifa: '13,4' },
  ],
  trayectos: [
    {
      cdgoTren: '09201',
      fecha: FECHA,
      tipoTren: 'AVANT',
      descripcionEstacionOrigen: 'A CORUÑA',
      descripcionEstacionDestino: 'SANTIAGO DE COMPOSTELA-DANIEL CASTELAO',
      horaSalida: '21:00:00',
      horaLlegada: '21:29:00',
    },
    {
      cdgoTren: '00622',
      fecha: FECHA,
      tipoTren: 'ALVIA',
      descripcionEstacionOrigen: 'SANTIAGO DE COMPOSTELA-DANIEL CASTELAO',
      descripcionEstacionDestino: 'VIGO URZAIZ',
      horaSalida: '21:50:00',
      horaLlegada: '22:57:00',
    },
  ],
};

/** Otra conexión con el MISMO primer tramo (09201) pero segundo tren MD. */
const conexionMd: TrenVenta = {
  ...conexionAlvia,
  tarifaMinima: '17,15',
  tipoTrenDos: 'MD',
  tarifasDisponibles: [{ titulo: 'Adulto ida', precioTarifa: '17,15' }],
  trayectos: [
    conexionAlvia.trayectos![0],
    {
      cdgoTren: '37722',
      fecha: FECHA,
      tipoTren: 'MD',
      descripcionEstacionOrigen: 'SANTIAGO DE COMPOSTELA-DANIEL CASTELAO',
      descripcionEstacionDestino: 'VIGO URZAIZ',
      horaSalida: '21:50:00',
      horaLlegada: '22:57:00',
    },
  ],
};

describe('mapearTrenesVenta', () => {
  it('expone llegada, duración, tipo de servicio y tarifa del tren directo', () => {
    const [fila] = mapearTrenesVenta([directa], FECHA, CODIGOS);
    expect(fila).toMatchObject({
      trenId: '04404-2026-10-05',
      numeroTren: '04404',
      salida: '19:33',
      disponible: true,
      precioMin: 40.7,
      tramo: 'directo',
      horaLlegada: '23:07',
      duracionMin: 214,
      tipoTren: 'AVE',
      tarifa: 'Básico',
    });
    expect(fila).not.toHaveProperty('conexionEn');
  });

  it('diferencia las dos conexiones que comparten el primer tramo (caso 09201)', () => {
    const filas = mapearTrenesVenta([directa, conexionAlvia, conexionMd], FECHA, CODIGOS);

    const [alvia, md] = [filas[1], filas[2]];
    expect(alvia?.numeroTren).toBe('09201 + 00622');
    expect(md?.numeroTren).toBe('09201 + 37722');
    expect(alvia?.trenId).not.toBe(md?.trenId);
    expect(alvia?.tramo).toBe('conexion');
    expect(alvia?.conexionEn).toBe('SANTIAGO DE COMPOSTELA-DANIEL CASTELAO');
    expect(alvia?.tarifa).toBe('Básico');
    expect(md?.tarifa).toBe('Adulto ida');
    expect(alvia?.precioMin).toBe(12.9);
    expect(md?.precioMin).toBe(17.15);
    expect([alvia?.tipoTren, md?.tipoTren]).toEqual(['AVANT + ALVIA', 'AVANT + MD']);
    expect([alvia?.duracionMin, md?.duracionMin]).toEqual([117, 117]);
    expect([alvia?.horaLlegada, md?.horaLlegada]).toEqual(['22:57', '22:57']);
    expect(new Set(filas.map((f) => f.trenId)).size).toBe(3);
  });

  it('marca como no disponible lo que la venta tiene completo o sin tarifa', () => {
    const [fila] = mapearTrenesVenta([{ ...directa, tarifaMinima: null }], FECHA, CODIGOS);
    expect(fila?.disponible).toBe(false);
    expect(fila?.precioMin).toBeNull();
    expect(fila?.tarifa).toBe('Básico');
  });
});

describe('tarifaMasBarata', () => {
  it('prefiere la tarifa cuyo precio coincide con tarifaMinima', () => {
    expect(tarifaMasBarata(directa)).toBe('Básico');
    expect(tarifaMasBarata(conexionMd)).toBe('Adulto ida');
  });

  it('sin tarifas o sin titulo no devuelve nada', () => {
    expect(tarifaMasBarata({ tarifaMinima: '10,0' })).toBeUndefined();
    expect(tarifaMasBarata({ tarifaMinima: '10,0', tarifasDisponibles: [{}] })).toBeUndefined();
  });
});

describe('deduplicarTrenes', () => {
  const fila = (
    sobrescribir: Partial<import('@mantirenfe/shared-types').EstadoTrenDisponible>,
  ): import('@mantirenfe/shared-types').EstadoTrenDisponible => ({
    trenId: '09201-2026-10-05',
    numeroTren: '09201',
    salida: '21:00',
    disponible: true,
    precioMin: 20,
    moneda: 'EUR',
    tramo: 'directo',
    ...sobrescribir,
  });

  it('quita filas con el mismo trenId y salida conservando la más barata', () => {
    const resultado = deduplicarTrenes([fila({ precioMin: 20 }), fila({ precioMin: 12.9 })]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.precioMin).toBe(12.9);
  });

  it('prefiere el directo a la conexión y el precio conocido al desconocido', () => {
    const conexion = fila({ tramo: 'conexion', precioMin: null });
    const directo = fila({ tramo: 'directo', precioMin: null });
    expect(deduplicarTrenes([conexion, directo])[0]?.tramo).toBe('directo');
    expect(
      deduplicarTrenes([fila({ precioMin: null }), fila({ precioMin: 40 })])[0]?.precioMin,
    ).toBe(40);
  });

  it('conserva las conexiones con distinto segundo tramo y el orden de la venta', () => {
    const una = fila({ trenId: '09201 + 00622-2026-10-05', numeroTren: '09201 + 00622' });
    const otra = fila({ trenId: '09201 + 37722-2026-10-05', numeroTren: '09201 + 37722' });
    const directo = fila({ trenId: '04404-2026-10-05', numeroTren: '04404' });
    const resultado = deduplicarTrenes([directo, una, otra]);
    expect(resultado.map((t) => t.numeroTren)).toEqual(['04404', '09201 + 00622', '09201 + 37722']);
  });

  it('una misma hora con distinto tren no se toca', () => {
    const a = fila({ trenId: '04154-2026-10-05', numeroTren: '04154' });
    const b = fila({ trenId: '34154-2026-10-05', numeroTren: '34154' });
    expect(deduplicarTrenes([a, b])).toHaveLength(2);
  });
});

describe('coincideNumeroTren', () => {
  it('el filtro de la alerta sigue casando con los tramos de una conexión', () => {
    expect(coincideNumeroTren('09201 + 00622', '09201')).toBe(true);
    expect(coincideNumeroTren('09201 + 00622', '00622')).toBe(true);
    expect(coincideNumeroTren('09201 + 00622', '04404')).toBe(false);
    expect(coincideNumeroTren('04404', '04404')).toBe(true);
  });
});
