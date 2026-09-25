import { Injectable } from '@nestjs/common';
import type { ProveedorAuth } from '@prisma/client';
import { getPrisma } from '@mantirenfe/database';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';
import { UsuarioRequest } from '../common/usuario-actual.decorator';

function mapearProveedor(proveedor: string): ProveedorAuth {
  if (proveedor.includes('google')) return 'GOOGLE';
  if (proveedor.includes('azure') || proveedor.includes('github')) return 'MICROSOFT';
  if (proveedor === 'email') return 'EMAIL';
  return 'EMAIL';
}

@Injectable()
export class AuthService {
  async obtenerOCrear(usuario: UsuarioRequest) {
    const prisma = getPrisma();
    const datos = {
      email: usuario.email || `${usuario.sub}@placeholder.mantirenfe`,
      nombre: usuario.nombre,
      avatarUrl: usuario.avatarUrl,
      proveedor: mapearProveedor(usuario.proveedor ?? 'email'),
    };

    return prisma.usuario.upsert({
      where: { id: usuario.sub },
      update: datos,
      create: { id: usuario.sub, ...datos },
    });
  }

  async obtenerPreferencias(usuario: UsuarioRequest): Promise<PreferenciasUsuario> {
    const usuarioDb = await this.obtenerOCrear(usuario);
    const preferencias = (usuarioDb.preferencias ?? {}) as Partial<PreferenciasUsuario>;
    return {
      notificacionesPush: preferencias.notificacionesPush ?? true,
      notificacionesEmail: preferencias.notificacionesEmail ?? false,
      recordatorioSalida: preferencias.recordatorioSalida ?? true,
      resumenViaje: preferencias.resumenViaje ?? true,
      minutosRecordatorio: preferencias.minutosRecordatorio ?? 50,
      tema: preferencias.tema ?? 'sistema',
    };
  }

  async guardarPreferencias(usuario: UsuarioRequest, preferencias: PreferenciasUsuario) {
    const prisma = getPrisma();
    await this.obtenerOCrear(usuario);
    return prisma.usuario.update({
      where: { id: usuario.sub },
      data: { preferencias: preferencias as object },
    });
  }
}
