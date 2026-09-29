import { describe, expect, it } from 'vitest';
import { Semforo } from './semforo';

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

describe('Semforo', () => {
  it('nunca supera el máximo de tareas simultáneas', async () => {
    const semaforo = new Semforo(2);
    let enCurso = 0;
    let maximoVisto = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        semaforo.ejecutar(async () => {
          enCurso += 1;
          maximoVisto = Math.max(maximoVisto, enCurso);
          await dormir(5);
          enCurso -= 1;
        }),
      ),
    );

    expect(maximoVisto).toBe(2);
    expect(enCurso).toBe(0);
  });

  it('devuelve el valor y libera la plaza aunque falle', async () => {
    const semaforo = new Semforo(1);

    await expect(
      semaforo.ejecutar(async () => {
        throw new Error('explosión');
      }),
    ).rejects.toThrow('explosión');

    await expect(semaforo.ejecutar(async () => 'siguiente')).resolves.toBe('siguiente');
  });

  it('rechaza un máximo inválido', () => {
    expect(() => new Semforo(0)).toThrow('>= 1');
    expect(() => new Semforo(1.5)).toThrow('>= 1');
  });
});
