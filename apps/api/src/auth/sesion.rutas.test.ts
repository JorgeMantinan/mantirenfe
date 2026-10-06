import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ES_PUBLICO_KEY } from '../common/es-publico.decorator';
import { AuthController } from './auth.controller';
import { AuthModule } from './auth.module';
import { SesionController } from './sesion.controller';
import { SesionService } from './sesion.service';

/** Solo interesa que no haya conexión real: el módulo importa Prisma. */
vi.mock('@mantirenfe/database', () => ({ getPrisma: () => ({}) }));

interface Ruta {
  metodo: number;
  ruta: string;
}

function prefijoDe(controlador: unknown): string {
  const meta = Reflect.getMetadata(PATH_METADATA, controlador) as string | string[] | undefined;
  if (Array.isArray(meta)) return meta[0] ?? '';
  return meta ?? '';
}

/** Todas las rutas declaradas por un `@Controller(prefijo)`. */
function rutasDe(controlador: new () => unknown): Ruta[] {
  const base = prefijoDe(controlador);
  const prototipo = controlador.prototype as Record<string, Function>;
  return Object.getOwnPropertyNames(prototipo)
    .filter((nombre) => nombre !== 'constructor')
    .filter((nombre) => typeof prototipo[nombre] === 'function')
    .filter((nombre) => Reflect.hasMetadata(PATH_METADATA, prototipo[nombre]))
    .map((nombre) => {
      const relativa = (Reflect.getMetadata(PATH_METADATA, prototipo[nombre]) as string) ?? '';
      return {
        metodo: Reflect.getMetadata(METHOD_METADATA, prototipo[nombre]) as number,
        ruta: `${base}/${relativa}`.replace(/\/{2,}/g, '/'),
      };
    });
}

function handler(nombre: keyof SesionController): Function {
  return SesionController.prototype[nombre] as unknown as Function;
}

describe('registro del BFF de cookies', () => {
  it('AuthModule da de alta el controlador y el servicio de sesión', () => {
    const controladores = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuthModule) as unknown[];
    const proveedores = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as unknown[];
    expect(controladores).toContain(SesionController);
    expect(proveedores).toContain(SesionService);
  });

  it('declara las cuatro rutas con su método HTTP', () => {
    expect(rutasDe(SesionController)).toEqual(
      expect.arrayContaining([
        { metodo: RequestMethod.POST, ruta: 'auth/login' },
        { metodo: RequestMethod.POST, ruta: 'auth/callback' },
        { metodo: RequestMethod.GET, ruta: 'auth/session' },
        { metodo: RequestMethod.POST, ruta: 'auth/logout' },
      ]),
    );
  });

  it('no pisa ninguna ruta existente de AuthController', () => {
    const todas = [...rutasDe(AuthController), ...rutasDe(SesionController)];
    const claves = todas.map((r) => `${r.metodo} ${r.ruta}`);
    expect(new Set(claves).size).toBe(claves.length);
    // ...y las preexistentes siguen ahí (me + preferencias)
    expect(claves).toContain(`${RequestMethod.GET} auth/me`);
    expect(claves).toContain(`${RequestMethod.GET} auth/preferencias`);
  });

  it('las cuatro son @EsPublico (la credencial es la cookie, no el Bearer)', () => {
    for (const nombre of ['login', 'callback', 'session', 'logout'] as const) {
      expect(Reflect.getMetadata(ES_PUBLICO_KEY, handler(nombre))).toBe(true);
    }
    // El resto de /auth sigue exigiendo Bearer: sin @EsPublico, el guard actúa
    expect(Reflect.getMetadata(ES_PUBLICO_KEY, AuthController.prototype.me)).toBeUndefined();
  });
});
