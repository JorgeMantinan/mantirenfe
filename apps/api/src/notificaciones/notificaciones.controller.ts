import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { pushTokenMovilSchema, suscripcionPushSchema } from '@mantirenfe/shared-types';
import { EsPublico } from '../common/es-publico.decorator';
import { UsuarioActual, UsuarioRequest } from '../common/usuario-actual.decorator';
import { NotificacionesService } from './notificaciones.service';

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
    const ids = (cuerpo as { ids?: unknown }).ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
      throw new BadRequestException('Se espera un array de ids');
    }
    return this.notificacionesService.marcarLeida(usuario, ids as string[]);
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
