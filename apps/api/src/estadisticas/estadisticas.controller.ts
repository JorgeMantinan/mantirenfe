import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsuarioActual, UsuarioRequest } from '../common/usuario-actual.decorator';
import { EstadisticasService } from './estadisticas.service';

@ApiTags('estadisticas')
@ApiBearerAuth()
@Controller('estadisticas')
export class EstadisticasController {
  constructor(private readonly estadisticasService: EstadisticasService) {}

  /**
   * Métricas de "Tu actividad" del usuario autenticado (el JwtAuthGuard global
   * la deja privada) con throttle propio, como el resto de GETs con consulta.
   */
  @Get()
  @Throttle({ default: { ttl: 10_000, limit: 20 } })
  obtener(@UsuarioActual() usuario: UsuarioRequest) {
    return this.estadisticasService.obtener(usuario);
  }
}
