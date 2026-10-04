import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getPrisma, Prisma } from '@mantirenfe/database';
import {
  NotificacionResponse,
  PushConfigResponse,
  SuscripcionPushInput,
} from '@mantirenfe/shared-types';
import { z } from 'zod';
import * as webpush from 'web-push';
import { UsuarioRequest } from '../common/usuario-actual.decorator';
import { asegurarUsuario } from '../common/utilidades';

/** Notificadores push admitidos: host exacto o cualquier subdominio. */
const HOSTS_PUSH_PERMITIDOS = [
  'fcm.googleapis.com',
  'web.push.apple.com',
  'ap.push.apple.com',
  'updates.push.services.mozilla.com',
  'notify-api.line.me',
] as const;

/** Sufijos de host admitidos: cualquier subdominio de estos dominios. */
const SUFIJOS_PUSH_PERMITIDOS = ['.firebase.google.com', '.push.apple.com'] as const;

/**
 * El endpoint de una suscripción es una URL que después se llamará para
 * enviar la notificación, así que una entrada manipulable abriría la puerta al
 * SSRF. Aquí se acota a `https://` estricto y a los notificadores conocidos:
 * IPs (IPv4/IPv6), localhost y rangos privados quedan fuera de forma explícita.
 */
function esEndpointPushPermitido(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  // Literales IP: IPv6 llega entre corchetes o con dos puntos; IPv4, con puntos
  // (también se tapan sus variantes numérica/hexadecimal, p. ej. 2130706433)
  if (host.includes(':') || host.startsWith('[')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (/^\d+$/.test(host) || /^0[xX][0-9a-fA-F]+$/.test(host)) return false;
  if (SUFIJOS_PUSH_PERMITIDOS.some((sufijo) => host.endsWith(sufijo))) return true;
  return HOSTS_PUSH_PERMITIDOS.some(
    (permitido) => host === permitido || host.endsWith(`.${permitido}`),
  );
}

/** Exportado para tests: el allowlist anti-SSRF es seguridad, no detalle. */
export const endpointPushSchema = z.string().min(1).max(2048).refine(esEndpointPushPermitido, {
  message:
    'Endpoint de notificación no permitido: se admiten solo endpoints https de FCM, Apple, Mozilla y LINE',
});

/** Violación de un unique de Prisma: la fila ya existe (posiblemente ajena). */
function esP2002(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function validarEndpoint(endpoint: string): string {
  const resultado = endpointPushSchema.safeParse(endpoint);
  if (!resultado.success) {
    throw new BadRequestException(resultado.error.issues[0]?.message ?? 'Endpoint no permitido');
  }
  return resultado.data;
}

@Injectable()
export class NotificacionesService {
  private configurado = false;

  constructor(private readonly config: ConfigService) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:dev@mantirenfe.app';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configurado = true;
    }
  }

  pushConfig(): PushConfigResponse {
    return {
      publicKey: this.config.get<string>('VAPID_PUBLIC_KEY') ?? '',
    };
  }

  async listar(usuario: UsuarioRequest, soloNoLeidas = false): Promise<NotificacionResponse[]> {
    const notificaciones = await getPrisma().notificacion.findMany({
      where: {
        usuarioId: usuario.sub,
        ...(soloNoLeidas ? { leida: false } : {}),
      },
      orderBy: { creadaEn: 'desc' },
      take: 100,
    });
    return notificaciones.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      cuerpo: n.cuerpo,
      datos: (n.datos as Record<string, unknown> | null) ?? null,
      leida: n.leida,
      creadaEn: n.creadaEn.toISOString(),
      alertaId: n.alertaId,
    }));
  }

  async contarNoLeidas(usuario: UsuarioRequest): Promise<number> {
    return getPrisma().notificacion.count({
      where: { usuarioId: usuario.sub, leida: false },
    });
  }

  async marcarLeida(usuario: UsuarioRequest, ids: string[]): Promise<{ actualizadas: number }> {
    const resultado = await getPrisma().notificacion.updateMany({
      where: { id: { in: ids }, usuarioId: usuario.sub },
      data: { leida: true },
    });
    return { actualizadas: resultado.count };
  }

  async limpiar(usuario: UsuarioRequest): Promise<{ eliminadas: number }> {
    const resultado = await getPrisma().notificacion.deleteMany({
      where: { usuarioId: usuario.sub },
    });
    return { eliminadas: resultado.count };
  }

  async suscribirPush(usuario: UsuarioRequest, input: SuscripcionPushInput) {
    // Primero la validación (nada de escribir si el endpoint no es admitido)
    const endpoint = validarEndpoint(input.endpoint);
    const prisma = getPrisma();
    await asegurarUsuario(prisma, usuario);

    // Comprobación y alta dentro de la MISMA transacción: sin el hueco de la
    // comprobación previa (TOCTOU) nadie puede quitarle la suscripción a otra
    // cuenta entre el `findUnique` y el `upsert`.
    try {
      return await prisma.$transaction(async (tx) => {
        const actualizada = await tx.suscripcionPush.updateMany({
          // Solo si la suscripción ya es de ESTA cuenta
          where: { endpoint, usuarioId: usuario.sub },
          data: {
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            plataforma: input.plataforma,
            activa: true,
          },
        });
        if (actualizada.count > 0) {
          return tx.suscripcionPush.findUnique({ where: { endpoint } });
        }
        // O no existe, o es de otra cuenta: en ese caso, prohibido
        const ajena = await tx.suscripcionPush.findUnique({
          where: { endpoint },
          select: { usuarioId: true },
        });
        if (ajena) throw new ForbiddenException('Esa suscripción ya está vinculada a otra cuenta');
        return tx.suscripcionPush.create({
          data: {
            usuarioId: usuario.sub,
            endpoint,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            plataforma: input.plataforma,
          },
        });
      });
    } catch (error) {
      // Otra cuenta ganó la carrera del `create`: conflicto, no reasignación
      if (esP2002(error)) {
        throw new ConflictException('Esa suscripción ya está vinculada a otra cuenta');
      }
      throw error;
    }
  }

  async desuscribirPush(usuario: UsuarioRequest, endpoint: string): Promise<void> {
    await getPrisma().suscripcionPush.updateMany({
      where: { endpoint, usuarioId: usuario.sub },
      data: { activa: false },
    });
  }

  async registrarTokenMovil(
    usuario: UsuarioRequest,
    input: { token: string; plataforma: 'ANDROID' | 'IOS' },
  ): Promise<void> {
    const prisma = getPrisma();
    await asegurarUsuario(prisma, usuario);

    // Mismo patrón que las suscripciones: comprobar y dar de alta sin carreras
    try {
      await prisma.$transaction(async (tx) => {
        const actualizado = await tx.tokenPushMovil.updateMany({
          where: { token: input.token, usuarioId: usuario.sub },
          data: { plataforma: input.plataforma, activa: true },
        });
        if (actualizado.count > 0) return;
        const ajeno = await tx.tokenPushMovil.findUnique({
          where: { token: input.token },
          select: { usuarioId: true },
        });
        if (ajeno) throw new ForbiddenException('Ese token ya está vinculado a otra cuenta');
        await tx.tokenPushMovil.create({
          data: {
            usuarioId: usuario.sub,
            token: input.token,
            plataforma: input.plataforma,
          },
        });
      });
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException('Ese token ya está vinculado a otra cuenta');
      }
      throw error;
    }
  }

  async borrarTokenMovil(usuario: UsuarioRequest, token: string): Promise<void> {
    await getPrisma().tokenPushMovil.updateMany({
      where: { token, usuarioId: usuario.sub },
      data: { activa: false },
    });
  }

  get estaConfigurado(): boolean {
    return this.configurado;
  }
}
