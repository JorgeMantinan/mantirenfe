/**
 * E2E de humo contra PRODUCCIÓN (web + API). Diseñado para GitHub Actions
 * (`.github/workflows/e2e.yml`): solo hace peticiones HTTP, sin BD directa.
 *
 * Comprueba: health (+memoria), estaciones, detalle CKAN, el regresivo de
 * trayectos por paradas (A Coruña→Vilagarcía: fue0 por la rotación de tripIds
 * de Renfe), salidas por estación, puntualidad, suprimidos, incidencias y el
 * ciclo completo de alerta (crear → detalle → precios → avisos → borrar).
 *
 * La cuenta es de PRUEBAS sin valor; si el repo llega a ser público, mover
 * email/contraseña a secrets de Actions.
 */
const BASE = 'https://mantirenfe.vercel.app/api';
// Clave publishable de Supabase: PÚBLICA por diseño (va en el bundle de la web).
const SUPA_URL = process.env.E2E_SUPA_URL ?? 'https://mcntuqhmtnzoppkhpjxn.supabase.co';
const SUPA_KEY = process.env.E2E_SUPA_KEY ?? 'sb_publishable_ad22iEbBBSSEMdH6bFvgEA_8RrMC48W';
// Cuenta de pruebas: como SECRETS de Actions. ¡La contraseña se rotó al sacarla
// del código (siguió en el historial de git)!
const E2E_EMAIL = process.env.E2E_EMAIL ?? '';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '';
if (!E2E_EMAIL || !E2E_PASSWORD) {
  console.error('Faltan E2E_EMAIL / E2E_PASSWORD (secrets de GitHub Actions)');
  process.exit(1);
}

interface Resultado {
  nombre: string;
  ok: boolean;
  detalle: string;
}
const resultados: Resultado[] = [];

function comprobar(nombre: string, condicion: boolean, detalle: string): void {
  resultados.push({ nombre, ok: condicion, detalle });
  console.log(`${condicion ? 'PASS' : 'FAIL'} | ${nombre} | ${detalle}`);
}

const hoy = new Date().toISOString().slice(0, 10);
const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

async function getJson<T>(ruta: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const r = await fetch(`${BASE}${ruta}`, init);
  let data: T | null = null;
  try {
    data = (await r.json()) as T;
  } catch {
    data = null;
  }
  return { status: r.status, data: data as T };
}

async function main(): Promise<void> {
  // 1. Health con diagnóstico de memoria
  const health = await getJson<{ estado: Record<string, string>; memoria?: { rssMb: number } }>(
    '/health',
  );
  comprobar(
    'health',
    health.status === 200 && health.data?.estado?.baseDatos === 'ok',
    `estado=${JSON.stringify(health.data?.estado)} memoria=${JSON.stringify(health.data?.memoria)}`,
  );

  // 2. Estaciones y ficha enriquecida (CKAN)
  const estaciones = await getJson<Array<{ nombre: string }>>('/estaciones?q=Vigo&limite=3');
  comprobar(
    'estaciones',
    estaciones.status === 200 && estaciones.data.length > 0,
    `${estaciones.data?.length ?? 0} resultados`,
  );

  const detalle = await getJson<{ poblacion?: string }>('/estaciones/detalle?codigo=04040');
  comprobar('detalle estacion (CKAN)', detalle.status === 200, `status=${detalle.status}`);

  // 3. Regresión de tripIds: trayecto con parada intermedia
  const vilagarcia = await getJson<{ trenes: unknown[] }>(
    `/trenes/horarios?origen=A%20Coru%C3%B1a&destino=Vilagarc%C3%ADa%20de%20Arousa&fecha=${manana}`,
  );
  comprobar(
    'trayecto por paradas (A Coruña→Vilagarcía)',
    vilagarcia.status === 200 && (vilagarcia.data?.trenes?.length ?? 0) >= 1,
    `${vilagarcia.data?.trenes?.length ?? 0} trenes`,
  );

  // 4. Salidas por estación (incluye paradas intermedias)
  const arcade = await getJson<unknown[]>('/trenes/estacion?estacion=Arcade&fecha=' + hoy);
  comprobar(
    'salidas desde estación (Arcade)',
    arcade.status === 200 && Array.isArray(arcade.data) && arcade.data.length >= 1,
    `${Array.isArray(arcade.data) ? arcade.data.length : 0} salidas`,
  );

  // 5. Endpoints de información
  const puntualidad = await getJson<unknown[]>(`/trenes/puntualidad?mes=${hoy.slice(0, 7)}`);
  comprobar(
    'puntualidad',
    puntualidad.status === 200 && Array.isArray(puntualidad.data),
    `status=${puntualidad.status}`,
  );

  const suprimidos = await getJson<unknown[]>(`/suprimidos?fecha=${hoy}`);
  comprobar(
    'suprimidos',
    suprimidos.status === 200 && Array.isArray(suprimidos.data),
    `status=${suprimidos.status}`,
  );

  const incidencias = await getJson<unknown[]>('/incidencias');
  comprobar(
    'incidencias',
    incidencias.status === 200 && Array.isArray(incidencias.data),
    `${Array.isArray(incidencias.data) ? incidencias.data.length : 0} activas`,
  );

  // 6. Ciclo de alerta con login real (sin signup: evita correos de rebote)
  const login = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: SUPA_KEY },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  });
  const sesion = (await login.json()) as { access_token?: string };
  comprobar(
    'login usuario e2e',
    login.status === 200 && !!sesion.access_token,
    `status=${login.status}`,
  );
  if (!sesion.access_token) return;

  const auth = {
    'content-type': 'application/json',
    authorization: `Bearer ${sesion.access_token}`,
  };

  const crear = await fetch(`${BASE}/alertas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      origenNombre: 'A Coruña',
      destinoNombre: 'A Vigo',
      fechaViaje: manana,
      criterio: 'DISPONIBILIDAD',
      intervaloSondeoMin: 10,
      bono: 'GENERAL',
      notas: 'e2e-ci',
    }),
  });
  const alerta = (await crear.json()) as { id?: string };
  comprobar('crear alerta', crear.status === 201 && !!alerta.id, `status=${crear.status}`);
  if (alerta.id) {
    const precios = await getJson<unknown[]>(`/alertas/${alerta.id}/precios`, { headers: auth });
    comprobar('historial de precios', precios.status === 200, `status=${precios.status}`);
    const avisos = await getJson<unknown[]>(`/alertas/${alerta.id}/avisos`, { headers: auth });
    comprobar('avisos de la alerta', avisos.status === 200, `status=${avisos.status}`);
    await fetch(`${BASE}/alertas/${alerta.id}`, { method: 'DELETE', headers: auth });
  }
  await fetch(`${BASE}/notificaciones`, { method: 'DELETE', headers: auth }).catch(() => undefined);

  const fallidos = resultados.filter((r) => !r.ok);
  console.log(`\nE2E: ${resultados.length - fallidos}/${resultados.length} OK`);
  if (fallidos.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error('E2E crash:', e);
  process.exit(1);
});
