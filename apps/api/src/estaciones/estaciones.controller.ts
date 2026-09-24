import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EsPublico } from '../common/es-publico.decorator';
import { EstacionesService } from './estaciones.service';

@ApiTags('estaciones')
@Controller('estaciones')
export class EstacionesController {
  constructor(private readonly estacionesService: EstacionesService) {}

  @Get()
  @EsPublico()
  buscar(@Query('q') q?: string, @Query('limite') limite?: string) {
    return this.estacionesService.buscar(q, limite ? Number(limite) : undefined);
  }
}
