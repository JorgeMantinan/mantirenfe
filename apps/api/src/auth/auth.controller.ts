import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { preferenciasUsuarioSchema } from '@mantirenfe/shared-types';
import { UsuarioActual, UsuarioRequest } from '../common/usuario-actual.decorator';
import { AuthService } from './auth.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  async me(@UsuarioActual() usuario: UsuarioRequest) {
    const usuarioDb = await this.authService.obtenerOCrear(usuario);
    return {
      id: usuarioDb.id,
      email: usuarioDb.email,
      nombre: usuarioDb.nombre,
      avatarUrl: usuarioDb.avatarUrl,
      proveedor: usuarioDb.proveedor,
      preferencias: await this.authService.obtenerPreferencias(usuario),
    };
  }

  @Get('preferencias')
  async preferencias(@UsuarioActual() usuario: UsuarioRequest) {
    return this.authService.obtenerPreferencias(usuario);
  }

  @Post('preferencias')
  @HttpCode(200)
  async guardarPreferencias(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const parsed = preferenciasUsuarioSchema.safeParse(cuerpo);
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors };
    }
    await this.authService.guardarPreferencias(usuario, parsed.data);
    return parsed.data;
  }

  @Get('validar-esquema')
  @HttpCode(200)
  validarEsquema() {
    return { ok: z.string().safeParse('ok').success };
  }
}
