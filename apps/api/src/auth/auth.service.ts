import { Injectable } from '@nestjs/common';
import type { ProveedorAuth } from '@prisma/client';
import { getPrisma } from '@mantirenfe/database';
import type { PreferenciasUsuario } from '@mantirenfe/shared-types';
import { UsuarioRequest } from '../common/usuario-actual.decorator';
import { asegurarUsuario } from '../common/utilidades';

function mapearProveedor(proveedor: string): ProveedorAuth {
  if (proveedor.includes('google')) return 'GOOGLE';
  if (proveedor.includes('azure') || proveedor.includes('github')) return 'MICROSOFT';
  if (proveedor === 'email') return 'EMAIL';
  return 'EMAIL';
}

/** Preferencias guardadas con los mismos defaults que ve la UI. */
function preferenciasDe(usuarioDb: { preferencias: unknown }): PreferenciasUsuario {
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

@Injectable()
export class AuthService {
  async obtenerOCrear(usuario: UsuarioRequest) {
    return asegurarUsuario(getPrisma(), usuario, {
      nombre: usuario.nombre,
      avatarUrl: usuario.avatarUrl,
      proveedor: mapearProveedor(usuario.proveedor ?? 'email'),
    });
  }

  /**
   * Usuario y preferencias a partir de UNA sola escritura: `GET /auth/me`
   * antes hacía dos upserts (uno aquí y otro dentro de `obtenerPreferencias`).
   */
  async obtenerUsuarioYPreferencias(usuario: UsuarioRequest) {
    const usuarioDb = await this.obtenerOCrear(usuario);
    return { usuario: usuarioDb, preferencias: preferenciasDe(usuarioDb) };
  }

  async obtenerPreferencias(usuario: UsuarioRequest): Promise<PreferenciasUsuario> {
    return preferenciasDe(await this.obtenerOCrear(usuario));
  }

  async guardarPreferencias(usuario: UsuarioRequest, preferencias: PreferenciasUsuario) {
    const prisma = getPrisma();
    await this.obtenerOCrear(usuario);
    return prisma.usuario.update({
      where: { id: usuario.sub },
      data: { preferencias: preferencias as object },
    });
  }

  /**
   * PATCH parcial (read-modify-write): se leen las preferencias guardadas, se
   * mezclan en superficial con las claves enviadas y se vuelve a escribir el
   * objeto completo. A diferencia del POST, las claves ausentes NO se pisan
   * (dos clientes tocan campos distintos sin pisarse), y el resultado es el
   * mismo objeto completo que devuelve el GET.
   */
  async actualizarPreferenciasParciales(
    usuario: UsuarioRequest,
    parciales: Partial<PreferenciasUsuario>,
  ): Promise<PreferenciasUsuario> {
    const prisma = getPrisma();
    const usuarioDb = await this.obtenerOCrear(usuario);
    const mezcladas: PreferenciasUsuario = {
      ...preferenciasDe(usuarioDb),
      ...sinUndefined(parciales),
    };
    await prisma.usuario.update({
      where: { id: usuario.sub },
      data: { preferencias: mezcladas as object },
    });
    return mezcladas;
  }
}

/**
 * Un campo que el cliente NO manda llega como `undefined` (o lo pone zod al
 * parsear `{}`): ese `undefined` no debe borrar el valor guardado, así que las
 * claves sin valor se descartan antes de la mezcla.
 */
function sinUndefined(parciales: Partial<PreferenciasUsuario>): Partial<PreferenciasUsuario> {
  const resultado: Partial<PreferenciasUsuario> = {};
  for (const clave of Object.keys(parciales)) {
    const valor = (parciales as Record<string, unknown>)[clave];
    if (valor !== undefined) (resultado as Record<string, unknown>)[clave] = valor;
  }
  return resultado;
}
