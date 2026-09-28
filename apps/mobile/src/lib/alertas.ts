import { crearAlertaSchema } from '@mantirenfe/shared-types';

export function validarAlerta(datos: unknown) {
  return crearAlertaSchema.safeParse(datos);
}

export function etiquetaBono(bono: string): string {
  const etiquetas: Record<string, string> = {
    GENERAL: 'Sin bono / general',
    BONO_10: 'Bono 10',
    BONO_20: 'Bono 20',
    JUVENIL: 'Bono Joven',
    ESTUDIANTE: 'Estudiante',
    DISCAPACIDAD: 'Discapacidad',
    FAMILIA_NUMEROSA: 'Familia numerosa',
    MAYOR_60: 'Mayor de 60',
    OTRO: 'Otro',
  };
  return etiquetas[bono] ?? bono;
}

export function etiquetaEstado(estado: string): string {
  if (estado === 'ACTIVA') return 'Activa';
  if (estado === 'PAUSA') return 'En pausa';
  if (estado === 'COMPLETADA') return 'Completada';
  return estado;
}

/** Recuento histórico de la alerta: "3 avisos" (singular con 1). */
export function etiquetaAvisos(total: number): string {
  return `${total} ${total === 1 ? 'aviso' : 'avisos'}`;
}
