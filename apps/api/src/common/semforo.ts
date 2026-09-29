/**
 * Limita cuántas tareas costosas corren a la vez dentro del mismo proceso.
 *
 * En Render (512 MB) el problema no es una consulta grande, sino N iguales en
 * paralelo: cada una materializa sus filas en el mismo heap y los picos se
 * suman. El semáforo serializa lo caro sin cambiar el resultado, solo el orden.
 */
export class Semforo {
  private activos = 0;
  private readonly espera: Array<() => void> = [];

  constructor(private readonly maximo: number) {
    if (!Number.isInteger(maximo) || maximo < 1) {
      throw new Error('El máximo de tareas simultáneas debe ser un entero >= 1');
    }
  }

  /** Ejecuta `fn` respetando el límite; las demás llamadas esperan su turno. */
  async ejecutar<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activos >= this.maximo) {
      await new Promise<void>((resolver) => this.espera.push(resolver));
    }
    this.activos += 1;
    try {
      return await fn();
    } finally {
      this.activos -= 1;
      this.espera.shift()?.();
    }
  }
}
