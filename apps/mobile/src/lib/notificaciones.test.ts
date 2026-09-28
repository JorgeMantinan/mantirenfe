import { describe, expect, it } from 'vitest';
import { destinoDeNotificacion } from './notificaciones';

describe('destinoDeNotificacion', () => {
  it('prefiere alertaId sobre cualquier otra cosa', () => {
    expect(destinoDeNotificacion({ alertaId: 'a1', url: '/notificaciones' })).toEqual({
      clase: 'alerta',
      alertaId: 'a1',
    });
    expect(destinoDeNotificacion({ alertaId: '  a2  ' })).toEqual({
      clase: 'alerta',
      alertaId: 'a2',
    });
  });

  it('abre el detalle cuando el worker manda url /alertas/<id>', () => {
    expect(destinoDeNotificacion({ url: '/alertas/a1' })).toEqual({
      clase: 'alerta',
      alertaId: 'a1',
    });
    expect(destinoDeNotificacion({ url: '/alertas/a1?origen=Madrid' })).toEqual({
      clase: 'alerta',
      alertaId: 'a1',
    });
  });

  it('entiende rutas absolutas del frontend sin salir de la app', () => {
    expect(destinoDeNotificacion({ url: 'https://mantirenfe.vercel.app/alertas/a1' })).toEqual({
      clase: 'alerta',
      alertaId: 'a1',
    });
  });

  it('las rutas que existen en el móvil se abren tal cual', () => {
    expect(destinoDeNotificacion({ url: '/avisos' })).toEqual({ clase: 'ruta', ruta: '/avisos' });
    expect(destinoDeNotificacion({ url: '/trenes?modo=estaciones' })).toEqual({
      clase: 'ruta',
      ruta: '/trenes',
    });
  });

  it('redirige a /avisos lo que es solo web (/notificaciones) o no tiene pantalla', () => {
    const avisos = { clase: 'ruta', ruta: '/avisos' };
    expect(destinoDeNotificacion({ url: '/notificaciones' })).toEqual(avisos);
    expect(destinoDeNotificacion({ url: '/puntualidad' })).toEqual(avisos);
    expect(destinoDeNotificacion({ tipo: 'incidencia' })).toEqual(avisos);
    expect(destinoDeNotificacion({ url: 'https://ejemplo.com/pagos' })).toEqual(avisos);
  });

  it('sin datos no navega', () => {
    expect(destinoDeNotificacion(undefined)).toBeNull();
    expect(destinoDeNotificacion({})).toBeNull();
    expect(destinoDeNotificacion({ alertaId: '   ', url: '' })).toBeNull();
  });
});
