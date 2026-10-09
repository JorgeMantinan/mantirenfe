import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EsPublico } from '../common/es-publico.decorator';
import { TrenesService } from './trenes.service';

@ApiTags('trenes')
@Controller('trenes')
export class TrenesController {
  constructor(private readonly trenesService: TrenesService) {}

  @Get('horarios')
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 30 } })
  horarios(
    @Query('origen') origen?: string,
    @Query('destino') destino?: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.trenesService.horarios({ origen, destino, fecha });
  }

  @Get('posiciones')
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 20 } })
  posiciones() {
    return this.trenesService.posiciones();
  }

  @Get('posiciones/traza')
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 30 } })
  traza(
    @Query('vehiculo') vehiculo?: string,
    @Query('horas') horas?: string,
    @Query('tripId') tripId?: string,
  ) {
    if (!vehiculo) {
      throw new BadRequestException('Falta el parámetro vehiculo');
    }
    return this.trenesService.traza(vehiculo, horas ? Number(horas) : 24, tripId ?? null);
  }

  @Get('estacion')
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 15 } })
  salidasEstacion(@Query('estacion') estacion?: string, @Query('fecha') fecha?: string) {
    if (!estacion) {
      throw new BadRequestException('Falta el parámetro estacion');
    }
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new BadRequestException('Fecha inválida (formato YYYY-MM-DD)');
    }
    return this.trenesService.salidasEstacion(estacion, fecha);
  }

  /**
   * Plazas y precio de una ruta+fecha (venta.renfe.com vía DWR). Cada consulta
   * puede costar varios segundos contra la venta, así que el límite es más
   * estrecho que el del resto de endpoints públicos de trenes.
   */
  @Get('disponibilidad')
  @EsPublico()
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  disponibilidad(
    @Query('origen') origen?: string,
    @Query('destino') destino?: string,
    @Query('fecha') fecha?: string,
  ) {
    return this.trenesService.disponibilidad({ origen, destino, fecha });
  }

  @Get('puntualidad')
  @EsPublico()
  @Throttle({ default: { ttl: 10_000, limit: 10 } })
  puntualidad(@Query('mes') mes?: string, @Query('orden') orden?: string) {
    return this.trenesService.puntualidadMes(mes, orden);
  }
}
