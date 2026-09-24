import type {
  ConsultaDisponibilidad,
  EstadoDisponibilidad,
  EstadoTrenDisponible,
} from '@mantirenfe/shared-types';
import type { FuenteDatosTren } from './tipos';

function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (Math.imul(31, h) + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export class FuenteMock implements FuenteDatosTren {
  readonly nombre = 'mock';

  async getDisponibilidad(consulta: ConsultaDisponibilidad): Promise<EstadoDisponibilidad> {
    const minutos = Math.floor(Date.now() / 60_000);
    const horas = ['08:00', '10:30', '13:00', '17:00', '19:00', '21:30'];
    const seleccionadas = horas.filter((h) => {
      if (consulta.horaDesde && h < consulta.horaDesde) return false;
      if (consulta.horaHasta && h > consulta.horaHasta) return false;
      return true;
    });
    const lista = seleccionadas.length > 0 ? seleccionadas : horas;

    const trenes: EstadoTrenDisponible[] = lista.map((salida, index) => {
      const clave = `${consulta.origenNombre}-${consulta.destinoNombre}-${salida}-${minutos}`;
      const disponible = (hash(clave) + index + minutos) % 3 !== 0;
      return {
        trenId: `mock-${salida.replace(':', '')}`,
        numeroTren: `mock-${index + 1}`,
        salida,
        disponible,
        precioMin: disponible ? 15 + (hash(salida) % 40) : null,
        moneda: 'EUR',
      };
    });

    return {
      consulta,
      trenes,
      consultadoEn: new Date().toISOString(),
    };
  }
}
