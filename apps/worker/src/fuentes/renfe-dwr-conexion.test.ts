import { describe, expect, it } from 'vitest';
import { mapearTrenesVenta, type TrenVenta } from './renfe-dwr';

const CODIGOS = { origen: '31412', destino: '08223' };
const FECHA = '2026-10-05';

/** Conexión 09201 (AVANT A Coruña→Santiago) + 00622 (ALVIA Santiago→Vigo). */
function conexion(trayectos: TrenVenta['trayectos']): TrenVenta {
  return {
    directo: false,
    fecha: FECHA,
    horaSalida: '21:00:00',
    horaLlegada: '22:57:00',
    tarifaMinima: '12,9',
    duracionViajeTotalEnMinutos: 117,
    tipoTrenUno: 'AVANT',
    tipoTrenDos: 'ALVIA',
    completo: false,
    razonNoDisponible: '',
    soloPlazaH: false,
    trayectos,
  };
}

const tramosConexion = [
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
];

describe('horas de la estación de enlace (conexionLlegada / conexionSalida)', () => {
  it('expone la llegada del primer tramo y la salida del segundo con la espera', () => {
    const [fila] = mapearTrenesVenta([conexion(tramosConexion)], FECHA, CODIGOS);
    expect(fila).toMatchObject({
      tramo: 'conexion',
      conexionEn: 'SANTIAGO DE COMPOSTELA-DANIEL CASTELAO',
      conexionLlegada: '21:29',
      conexionSalida: '21:50',
      esperaMin: 21,
      horaLlegada: '22:57',
    });
  });

  it('un tren directo no lleva horas de enlace', () => {
    const directo: TrenVenta = {
      directo: true,
      fecha: FECHA,
      horaSalida: '19:33:00',
      horaLlegada: '23:07:00',
      tarifaMinima: '40,7',
      completo: false,
      razonNoDisponible: '',
      soloPlazaH: false,
      trayectos: [tramosConexion[0]],
    };
    const [fila] = mapearTrenesVenta([directo], FECHA, CODIGOS);
    expect(fila).not.toHaveProperty('conexionLlegada');
    expect(fila).not.toHaveProperty('conexionSalida');
    expect(fila).not.toHaveProperty('esperaMin');
  });

  it('omite la espera cuando el cruce de medianoche no es fiable', () => {
    const nocturna = [tramosConexion[0], { ...tramosConexion[1], horaSalida: '20:15:00' }];
    const [fila] = mapearTrenesVenta([conexion(nocturna)], FECHA, CODIGOS);
    expect(fila?.conexionLlegada).toBe('21:29');
    expect(fila?.conexionSalida).toBe('20:15');
    expect(fila).not.toHaveProperty('esperaMin');
  });

  it('omite los campos si la venta no trae horas legibles en los tramos', () => {
    const sinHoras = [
      { ...tramosConexion[0], horaLlegada: undefined },
      { ...tramosConexion[1], horaSalida: undefined },
    ];
    const [fila] = mapearTrenesVenta([conexion(sinHoras)], FECHA, CODIGOS);
    expect(fila?.tramo).toBe('conexion');
    expect(fila).not.toHaveProperty('conexionLlegada');
    expect(fila).not.toHaveProperty('conexionSalida');
    expect(fila).not.toHaveProperty('esperaMin');
  });
});
