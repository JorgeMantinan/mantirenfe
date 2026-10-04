import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EsPublico } from '../common/es-publico.decorator';
import { EstacionesService } from './estaciones.service';

@ApiTags('estaciones')
@Controller('estaciones')
export class EstacionesController {
  constructor(private readonly estacionesService: EstacionesService) {}

  /** Listado paginado: `?q=` busca, `?limite=` (máx. 50) y `?offset=` (default 0). */
  @Get()
  @EsPublico()
  buscar(
    @Query('q') q?: string,
    @Query('limite') limite?: string,
    @Query('offset') offset?: string,
  ) {
    return this.estacionesService.buscar(
      q,
      limite ? Number(limite) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  /** Ficha enriquecida: consulta dos fuentes externas de Renfe, más restrictiva. */
  @Get('detalle')
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 10 } })
  detalle(@Query('codigo') codigo?: string, @Query('q') q?: string) {
    return this.estacionesService.detalle(codigo, q);
  }
}
