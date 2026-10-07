import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { i18n } from '@/i18n';
import { calcularResumen, datosDeAlerta, errorDeFormulario, type EstadoFormulario } from './logica';

const t = i18n.t.bind(i18n) as TFunction;

const base: EstadoFormulario = {
  origen: ' Madrid-Atocha ',
  destino: 'Barcelona-Sants',
  frecuencia: 'fecha',
  fecha: '2026-10-10',
  dias: [1, 2, 3, 4, 5],
  horaDesde: '',
  horaHasta: '',
  criterios: ['DISPONIBILIDAD'],
  conexiones: false,
  precioObjetivo: '',
  intervalo: 10,
  bono: 'GENERAL',
  numeroTren: '03124',
  notas: '',
  tambienVuelta: false,
  fechaVuelta: '',
  horaDesdeVuelta: '',
  horaHastaVuelta: '',
};

describe('errorDeFormulario', () => {
  it('formulario válido → null', () => {
    expect(errorDeFormulario(base, t)).toBeNull();
  });

  it('origen o destino demasiado cortos → su mensaje', () => {
    expect(errorDeFormulario({ ...base, origen: 'x' }, t)).toBe(
      t('nuevaAlerta.errorOrigenDestino'),
    );
    expect(errorDeFormulario({ ...base, destino: '' }, t)).toBe(
      t('nuevaAlerta.errorOrigenDestino'),
    );
  });

  it('sin fecha en frecuencia «fecha» y sin días en «dias»', () => {
    expect(errorDeFormulario({ ...base, fecha: '' }, t)).toBe(t('nuevaAlerta.errorFecha'));
    expect(errorDeFormulario({ ...base, frecuencia: 'dias', dias: [] }, t)).toBe(
      t('nuevaAlerta.errorDias'),
    );
  });

  it('vuelta anterior a la ida y franja de vuelta mal ordenada', () => {
    expect(errorDeFormulario({ ...base, tambienVuelta: true }, t)).toBe(
      t('nuevaAlerta.errorFechaVuelta'),
    );
    expect(errorDeFormulario({ ...base, tambienVuelta: true, fechaVuelta: '2026-10-09' }, t)).toBe(
      t('nuevaAlerta.errorFechaVueltaOrden'),
    );
    expect(
      errorDeFormulario(
        {
          ...base,
          tambienVuelta: true,
          fechaVuelta: '2026-10-12',
          horaDesdeVuelta: '10:00',
          horaHastaVuelta: '09:00',
        },
        t,
      ),
    ).toBe(t('nuevaAlerta.errorFranjaVueltaOrden'));
  });

  it('criterios vacíos o precio objetivo inválido', () => {
    expect(errorDeFormulario({ ...base, criterios: [] }, t)).toBe(
      t('nuevaAlerta.errorSinCriterio'),
    );
    expect(errorDeFormulario({ ...base, criterios: ['PRECIO'] }, t)).toBe(
      t('nuevaAlerta.errorPrecio'),
    );
    // El input es numérico: la coma no la acepta Number() (como en la API)
    expect(errorDeFormulario({ ...base, criterios: ['PRECIO'], precioObjetivo: '12,50' }, t)).toBe(
      t('nuevaAlerta.errorPrecio'),
    );
    expect(
      errorDeFormulario({ ...base, criterios: ['PRECIO'], precioObjetivo: '12.50' }, t),
    ).toBeNull();
  });
});

describe('datosDeAlerta', () => {
  it('recorta extremos y respeta el formato que espera la API', () => {
    expect(datosDeAlerta(base, '2026-10-10')).toEqual({
      origenNombre: 'Madrid-Atocha',
      destinoNombre: 'Barcelona-Sants',
      fechaViaje: '2026-10-10',
      recurrente: false,
      diasSemana: [],
      fechaFlexible: false,
      horaDesde: null,
      horaHasta: null,
      numeroTren: '03124',
      criterio: 'DISPONIBILIDAD',
      criterios: ['DISPONIBILIDAD'],
      conexiones: false,
      precioObjetivo: null,
      intervaloSondeoMin: 10,
      bono: 'GENERAL',
      notas: null,
    });
  });

  it('cotidiano: días ordenados; conexiones solo con DISPONIBILIDAD; precio solo con PRECIO', () => {
    const datos = datosDeAlerta(
      {
        ...base,
        frecuencia: 'dias',
        dias: [5, 1, 3],
        criterios: ['PRECIO', 'HORARIO'],
        conexiones: true,
        precioObjetivo: '45.50',
        notas: '  Ventana  ',
      },
      '2026-10-10',
    );
    expect(datos.recurrente).toBe(true);
    expect(datos.diasSemana).toEqual([1, 3, 5]);
    expect(datos.criterio).toBe('PRECIO');
    expect(datos.conexiones).toBe(false);
    expect(datos.precioObjetivo).toBe(45.5);
    expect(datos.notas).toBe('Ventana');
  });
});

describe('calcularResumen', () => {
  it('ruta · fecha · franja · criterios, para la caja y el toast', () => {
    const resumen = calcularResumen({ ...base, horaDesde: '08:00', horaHasta: '10:00' }, [], t);
    expect(resumen.fecha).not.toBe('');
    expect(resumen.franja).toBe('08:00–10:00');
    expect(resumen.criterio).toContain(t('nuevaAlerta.criterioPlazas'));
    expect(resumen.texto).toBe(
      `Madrid-Atocha → Barcelona-Sants · ${resumen.fecha} · 08:00–10:00 · ${resumen.criterio}`,
    );
    expect(resumen.salidas).toEqual([]);
  });

  it('con precio vigilado y sin franja no aparece la franja vacía', () => {
    const resumen = calcularResumen(
      { ...base, criterios: ['PRECIO'], precioObjetivo: '30' },
      [],
      t,
    );
    expect(resumen.franja).toBeNull();
    expect(resumen.criterio).toContain('≤ 30 €');
  });
});
