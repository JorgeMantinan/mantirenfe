import { BadRequestException, Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { preferenciasUsuarioSchema } from '@mantirenfe/shared-types';
import { UsuarioActual, UsuarioRequest } from '../common/usuario-actual.decorator';
import { AuthService } from './auth.service';

/**
 * Mismos campos que el guardado completo pero TODOS opcionales: solo lo que el
 * cliente manda se aplica (`.partial()` quita también los defaults de zod, así
 * que un campo ausente ni siquiera aparece en el resultado del parseo).
 * Exportado para el test del parseo parcial.
 */
export const preferenciasParcialSchema = preferenciasUsuarioSchema.partial();

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

  /**
   * Guardado PARCIAL: body con solo las claves a cambiar (p. ej. `{ tema }`),
   * que se mezclan en superficial con lo guardado. Devuelve las preferencias
   * completas, igual que el GET. El POST de arriba sigue siendo el guardado
   * completo que usa la pantalla de ajustes.
   */
  @Patch('preferencias')
  @HttpCode(200)
  async actualizarPreferencias(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const parsed = preferenciasParcialSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.authService.actualizarPreferenciasParciales(usuario, parsed.data);
  }
}
