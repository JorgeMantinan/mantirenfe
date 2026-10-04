/**
 * Destino interno seguro para redirecciones (login ?redirect= y el clic de
 * una notificación push). Solo se aceptan rutas relativas al sitio:
 * empiezan por «/», nunca por «//» ni por «http» (evita open redirect).
 */
export function rutaSegura(destino: string | null | undefined, respaldo = '/dashboard'): string {
  const ruta = (destino ?? '').trim();
  if (!ruta.startsWith('/')) return respaldo;
  // "//evil.com" y "/\evil.com" viajarían a otro origen
  if (ruta.startsWith('//') || ruta.startsWith('/\\')) return respaldo;
  // "/http://evil.com" se comería como esquema al resolverlo
  if (/^https?:/i.test(ruta.slice(1))) return respaldo;
  return ruta;
}
