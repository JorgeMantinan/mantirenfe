import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
    // UNA sola escritura: las preferencias se derivan del usuario ya leído
    const { usuario: usuarioDb, preferencias } =
      await this.authService.obtenerUsuarioYPreferencias(usuario);
    return {
      id: usuarioDb.id,
      email: usuarioDb.email,
      nombre: usuarioDb.nombre,
      avatarUrl: usuarioDb.avatarUrl,
      proveedor: usuarioDb.proveedor,
      preferencias,
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
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    await this.authService.guardarPreferencias(usuario, parsed.data);
    return parsed.data;
  }
}
