export function serializarEstadoParaDiff(trenes: Array<{ trenId: string; disponible: boolean }>) {
  return [...trenes].sort((a, b) => a.trenId.localeCompare(b.trenId));
}
