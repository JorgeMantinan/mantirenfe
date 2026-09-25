import { describe, expect, it } from 'vitest';
import { claveBusqueda, filtrarEstaciones, normalizarTexto } from './estaciones';

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

describe('claveBusqueda', () => {
  it('ignora artículos iniciales: La Coruña = A Coruña = Coruña', () => {
    expect(claveBusqueda('La Coruña')).toBe(claveBusqueda('A Coruña'));
    expect(claveBusqueda('A Coruña')).toBe('coruna');
    expect(claveBusqueda('Coruña')).toBe('coruna');
    expect(claveBusqueda('El Escorial')).toBe(claveBusqueda('Escorial'));
  });

  it('convierte guiones y puntuación en espacios', () => {
    expect(claveBusqueda('Valencia-Joaquin')).toBe('valencia joaquin');
    expect(claveBusqueda('València Joaquín')).toBe('valencia joaquin');
    expect(claveBusqueda('  Madrid,  Atocha ')).toBe('madrid atocha');
  });
});

describe('búsquedas con variantes', () => {
  const coruña = [{ nombre: 'A Coruña', ciudad: null as string | null }];
  const valencia = [{ nombre: 'València-Joaquín Sorolla', ciudad: null as string | null }];

  it('encuentra A Coruña escribiendo La Coruña, Coruña o A Coruña', () => {
    expect(filtrarEstaciones(coruña, 'La Coruña')).toHaveLength(1);
    expect(filtrarEstaciones(coruña, 'coruña')).toHaveLength(1);
    expect(filtrarEstaciones(coruña, 'A CORUÑA')).toHaveLength(1);
  });

  it('guiones y espacios son intercambiables', () => {
    expect(filtrarEstaciones(valencia, 'valencia joaquin sorolla')).toHaveLength(1);
    expect(filtrarEstaciones(valencia, 'valencia-joaquin-sorolla')).toHaveLength(1);
  });

  it('tolera una errata pequeña cuando no hay coincidencia exacta', () => {
    expect(filtrarEstaciones(estaciones, 'cordobba')).toHaveLength(1); // Córdoba
    expect(filtrarEstaciones(valencia, 'valencja')).toHaveLength(1);
    expect(filtrarEstaciones(estaciones, 'zzzzz')).toEqual([]); // nada razonable
  });
});
