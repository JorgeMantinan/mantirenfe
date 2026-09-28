import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EsPublico } from '../common/es-publico.decorator';
import { SuprimidosService } from './suprimidos.service';

@ApiTags('suprimidos')
@Controller('suprimidos')
export class SuprimidosController {
  constructor(private readonly suprimidosService: SuprimidosService) {}

  /** Lista histórica (7 días) de trenes cancelados en el feed GTFS-RT. */
  @Get()
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 20 } })
  listado(@Query('fecha') fecha?: string, @Query('estacion') estacion?: string) {
    return this.suprimidosService.listado(fecha, estacion);
  }
}
