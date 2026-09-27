import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EsPublico } from '../common/es-publico.decorator';
import { IncidenciasService } from './incidencias.service';

@ApiTags('incidencias')
@Controller('incidencias')
export class IncidenciasController {
  constructor(private readonly incidenciasService: IncidenciasService) {}

  @Get()
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 20 } })
  activas() {
    return this.incidenciasService.activas();
  }
}
