import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getPrisma } from '@mantirenfe/database';
import {
  NotificacionResponse,
  PushConfigResponse,
  SuscripcionPushInput,
} from '@mantirenfe/shared-types';
import * as webpush from 'web-push';
import { UsuarioRequest } from '../common/usuario-actual.decorator';

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

  async suscribirPush(usuario: UsuarioRequest, input: SuscripcionPushInput) {
    const prisma = getPrisma();
    await prisma.usuario.upsert({
      where: { id: usuario.sub },
      update: {},
      create: { id: usuario.sub, email: usuario.email || `${usuario.sub}@placeholder` },
    });
    return prisma.suscripcionPush.upsert({
      where: { endpoint: input.endpoint },
      update: {
        usuarioId: usuario.sub,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        plataforma: input.plataforma,
        activa: true,
      },
      create: {
        usuarioId: usuario.sub,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        plataforma: input.plataforma,
      },
    });
  }

  async desuscribirPush(usuario: UsuarioRequest, endpoint: string): Promise<void> {
    await getPrisma().suscripcionPush.updateMany({
      where: { endpoint, usuarioId: usuario.sub },
      data: { activa: false },
    });
  }

  get estaConfigurado(): boolean {
    return this.configurado;
  }
}
