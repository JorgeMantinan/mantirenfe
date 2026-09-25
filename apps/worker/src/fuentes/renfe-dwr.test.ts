import { describe, expect, it } from 'vitest';
import { disponibleSegunReglas, extraerListaTrenes } from './renfe-dwr';

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
