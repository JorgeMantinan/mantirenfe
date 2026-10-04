import type { PrismaClient, ProveedorAuth } from '@prisma/client';
import type { UsuarioRequest } from './usuario-actual.decorator';

/**
 * Minutos GTFS desde medianoche → hora peninsular `HH:MM`. Los servicios que
 * acaban tras la medianoche traen valores > 1440 y vuelven a envolver, igual
 * que al leer un ISO (una sola implementación para `suprimidos` y `puntualidad`).
 */
export function horaDesdeMinutos(minutos: number | null | undefined): string | null {
  if (minutos == null || !Number.isFinite(minutos)) return null;
  const total = ((Math.trunc(minutos) % 1440) + 1440) % 1440;
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/** Perfil del token que se refresca en la BD (solo auth lo manda). */
export interface DatosPerfilToken {
  nombre?: string | null;
  avatarUrl?: string | null;
  proveedor?: ProveedorAuth;
}

/**
 * El usuario del token puede no existir aún en la BD: cualquier escritura por
 * `usuarioId` (alertas, suscripciones de push, /auth/me) pasa por aquí para que
 * la FK nunca falle y para que haya UN solo sitio que define el email de
 * respaldo cuando el token no trae ninguno.
 *
 * Con `datos` (auth) además se refresca el perfil en cada visita; sin ellos
 * solo se garantiza que el registro exista.
 */
export async function asegurarUsuario(
  prisma: PrismaClient,
  usuario: UsuarioRequest,
  datos?: DatosPerfilToken,
) {
  const email = usuario.email || `${usuario.sub}@placeholder.mantirenfe`;
  return prisma.usuario.upsert({
    where: { id: usuario.sub },
    update: datos ? { email, ...datos } : {},
    create: { id: usuario.sub, email, ...datos },
  });
}
