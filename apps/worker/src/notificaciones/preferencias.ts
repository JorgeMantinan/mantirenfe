/**
 * Lee una preferencia booleana de `usuario.preferencias`. El esquema guarda por
 * defecto el string `"{}"`, así que un valor ausente, no booleano o JSON roto
 * cae siempre al default de la llamada.
 */
export function preferenciaBooleana(
  preferencias: unknown,
  clave: string,
  porDefecto: boolean,
): boolean {
  let valor: unknown = preferencias;
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor);
    } catch {
      return porDefecto;
    }
  }
  if (valor && typeof valor === 'object') {
    const v = (valor as Record<string, unknown>)[clave];
    if (typeof v === 'boolean') return v;
  }
  return porDefecto;
}
