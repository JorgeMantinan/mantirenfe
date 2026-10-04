import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { pushTokenMovilSchema, suscripcionPushSchema } from '@mantirenfe/shared-types';
import { z } from 'zod';
import { EsPublico } from '../common/es-publico.decorator';
import { UsuarioActual, UsuarioRequest } from '../common/usuario-actual.decorator';
import { NotificacionesService } from './notificaciones.service';

/** Lote de ids a marcar como leídos (acotado para no martillear la BD). */
const marcarLeidasSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(500),
});

@ApiTags('notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get('push-config')
  @EsPublico()
  pushConfig() {
    return this.notificacionesService.pushConfig();
  }

  @Get()
  listar(@UsuarioActual() usuario: UsuarioRequest, @Query('noLeidas') noLeidas?: string) {
    return this.notificacionesService.listar(usuario, noLeidas === 'true');
  }

  @Get('contador')
  async contador(@UsuarioActual() usuario: UsuarioRequest) {
    return { noLeidas: await this.notificacionesService.contarNoLeidas(usuario) };
  }

  @Patch('marcar-leidas')
  @HttpCode(200)
  async marcarLeidas(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const parsed = marcarLeidasSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.notificacionesService.marcarLeida(usuario, parsed.data.ids);
  }

  @Delete()
  @HttpCode(200)
  async limpiar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.notificacionesService.limpiar(usuario);
  }

  @Post('push-subscribe')
  async suscribir(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const parsed = suscripcionPushSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    await this.notificacionesService.suscribirPush(usuario, parsed.data);
    return { ok: true };
  }

  @Post('push-unsubscribe')
  @HttpCode(200)
  async desuscribir(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const endpoint = (cuerpo as { endpoint?: unknown }).endpoint;
    if (typeof endpoint !== 'string') {
      throw new BadRequestException('Se espera endpoint');
    }
    await this.notificacionesService.desuscribirPush(usuario, endpoint);
    return { ok: true };
  }

  @Post('push-token')
  async registrarTokenMovil(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const parsed = pushTokenMovilSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    await this.notificacionesService.registrarTokenMovil(usuario, parsed.data);
    return { ok: true };
  }

  @Post('push-token/unsubscribe')
  @HttpCode(200)
  async borrarTokenMovil(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const token = (cuerpo as { token?: unknown }).token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new BadRequestException('Se espera token');
    }
    await this.notificacionesService.borrarTokenMovil(usuario, token);
    return { ok: true };
  }
}
