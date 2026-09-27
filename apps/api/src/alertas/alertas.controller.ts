import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { actualizarAlertaSchema, crearAlertaSchema } from '@mantirenfe/shared-types';
import { UsuarioActual, UsuarioRequest } from '../common/usuario-actual.decorator';
import { AlertasService } from './alertas.service';

@ApiTags('alertas')
@ApiBearerAuth()
@Controller('alertas')
export class AlertasController {
  constructor(private readonly alertasService: AlertasService) {}

  @Get()
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.alertasService.listar(usuario);
  }

  // Declarado antes que :id para que la ruta con dos segmentos no compita
  @Get(':id/precios')
  precios(@UsuarioActual() usuario: UsuarioRequest, @Param('id') id: string) {
    return this.alertasService.precios(usuario, id);
  }

  @Get(':id')
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param('id') id: string) {
    return this.alertasService.obtener(usuario, id);
  }

  @Post()
  @HttpCode(201)
  async crear(@UsuarioActual() usuario: UsuarioRequest, @Body() cuerpo: unknown) {
    const parsed = crearAlertaSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.alertasService.crear(usuario, parsed.data);
  }

  @Patch(':id')
  async actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ) {
    const parsed = actualizarAlertaSchema.safeParse(cuerpo);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten().fieldErrors);
    }
    return this.alertasService.actualizar(usuario, id, parsed.data);
  }

  @Delete(':id')
  @HttpCode(204)
  eliminar(@UsuarioActual() usuario: UsuarioRequest, @Param('id') id: string) {
    return this.alertasService.eliminar(usuario, id);
  }
}
