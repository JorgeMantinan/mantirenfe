import type { ConsultaDisponibilidad, EstadoDisponibilidad } from '@mantirenfe/shared-types';
import type { FuenteDatosTren } from './tipos';

export class FuenteRenfeDwr implements FuenteDatosTren {
  readonly nombre = 'dwr';

  async getDisponibilidad(consulta: ConsultaDisponibilidad): Promise<EstadoDisponibilidad> {
    const origen = process.env.RENFE_DWR_ORIGEN ?? consulta.origenNombre;
    const destino = process.env.RENFE_DWR_DESTINO ?? consulta.destinoNombre;
    const fecha = consulta.fecha;

    const base = process.env.RENFE_VENTA_URL ?? 'https://venta.renfe.com';
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 15_000);

    try {
      const sesionRespuesta = await fetch(`${base}/vbe/tarifas.do`, {
        method: 'GET',
        signal: controlador.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml',
        },
      });

      const cookies = (sesionRespuesta.headers.getSetCookie?.() ?? [])
        .map((c) => c.split(';')[0])
        .join('; ');

      if (!sesionRespuesta.ok) {
        throw new Error(`RENFE_DWR_SESION_HTTP_${sesionRespuesta.status}`);
      }

      const parametros = new URLSearchParams({
        origen,
        destino,
        fecha,
        ...(consulta.horaDesde ? { horaDesde: consulta.horaDesde } : {}),
        ...(consulta.horaHasta ? { horaHasta: consulta.horaHasta } : {}),
      });

      const busqueda = await fetch(`${base}/vbe/buscar.do?${parametros.toString()}`, {
        method: 'GET',
        signal: controlador.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml',
          cookie: cookies,
          referer: `${base}/vbe/tarifas.do`,
        },
      });

      if (!busqueda.ok) {
        throw new Error(`RENFE_DWR_BUSQUEDA_HTTP_${busqueda.status}`);
      }

      const html = await busqueda.text();
      const completos = /no queda disponibilidad|servicio completo|sin asientos/i.test(html);

      return {
        consulta,
        trenes: [
          {
            trenId: `dwr-${fecha}-${consulta.origenNombre}-${consulta.destinoNombre}`,
            numeroTren: consulta.numeroTren ?? 'desconocido',
            salida: consulta.horaDesde ?? '00:00',
            disponible: !completos && html.length > 1000,
            precioMin: null,
            moneda: 'EUR',
          },
        ],
        consultadoEn: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
