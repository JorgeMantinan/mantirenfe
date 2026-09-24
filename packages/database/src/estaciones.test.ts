import { describe, expect, it } from 'vitest';
import { filtrarEstaciones, normalizarTexto } from './estaciones';

const estaciones = [
  { nombre: 'Madrid-Atocha Cercanías', ciudad: 'Madrid' },
  { nombre: 'Madrid-Puerta de Atocha-Almudena Grandes', ciudad: 'Madrid' },
  { nombre: 'Córdoba-Julio Anguita', ciudad: 'Córdoba' },
  { nombre: 'Sevilla-Santa Justa', ciudad: 'Sevilla' },
  { nombre: 'Barcelona-Sants', ciudad: 'Barcelona' },
];

describe('normalizarTexto', () => {
  it('quita tildes, pasa a minúsculas y recorta', () => {
    expect(normalizarTexto('  Córdoba ')).toBe('cordoba');
    expect(normalizarTexto('SÈVILLA')).toBe('sevilla');
  });
});

describe('filtrarEstaciones', () => {
  it('encuentra aunque falten tildes o cambien mayúsculas', () => {
    const resultado = filtrarEstaciones(estaciones, 'cordoba');
    expect(resultado.map((e) => e.nombre)).toEqual(['Córdoba-Julio Anguita']);
  });

  it('ordena: exacta, luego empieza por, luego contiene', () => {
    const resultado = filtrarEstaciones(
      [{ nombre: 'Sevilla-Santa Justa' }, { nombre: 'Sevilla' }, { nombre: 'Apeadero de Sevilla' }],
      'sevilla',
    );
    expect(resultado.map((e) => e.nombre)).toEqual([
      'Sevilla',
      'Sevilla-Santa Justa',
      'Apeadero de Sevilla',
    ]);
  });

  it('devuelve varias estaciones cuando el texto es ambiguo', () => {
    const resultado = filtrarEstaciones(estaciones, 'atocha');
    expect(resultado).toHaveLength(2);
  });

  it('busca también por ciudad y respeta el límite', () => {
    expect(filtrarEstaciones(estaciones, 'madrid', 1).map((e) => e.nombre)).toEqual([
      'Madrid-Atocha Cercanías',
    ]);
  });

  it('devuelve vacío sin texto o sin coincidencias', () => {
    expect(filtrarEstaciones(estaciones, '   ')).toEqual([]);
    expect(filtrarEstaciones(estaciones, 'zzz')).toEqual([]);
  });
});
