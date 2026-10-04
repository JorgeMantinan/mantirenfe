import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const authConfigurada = Boolean(url && anonKey);

/**
 * Adaptador de almacenamiento de la sesión para supabase-js.
 *
 * Decisiones de diseño:
 * - Las claves con `auth-token` o `refresh` (sesión, verificadores PKCE y
 *   usuario) se guardan en SecureStore; el resto claves siguen donde estaban
 *   (localStorage), que es el comportamiento de siempre.
 * - `expo-secure-store` se carga en tiempo de ejecución: una APK construida
 *   sin el módulo nativo (las actuales, hasta el próximo build; los cambios
 *   nativos no llegan por OTA) lanza en el `require` y seguimos con el
 *   almacenamiento actual, sin crashear.
 * - SecureStore sí trae API síncrona (`getItem`/`setItem`, que llaman a
 *   `getValueWithKeySync`/`setValueWithKeySync` en Android e iOS): se sondea en
 *   el primer uso y, si responde, los métodos devuelven valores en frío, que es
 *   lo que pide supabase-js. El sondeo cubre el caso contrario (la firma
 *   existe pero el native no responde): entonces no se usa.
 * - Respaldo cuando hay SecureStore pero sin API síncrona (web, o una build de
 *   natives anterior): caché en memoria precargada de forma asíncrona al
 *   arrancar. Ahí `getItem` lee la caché (miss → null), `setItem` escribe en
 *   caché y persiste en segundo plano, y los métodos devuelven promesa, que
 *   supabase-js también acepta (`SupportedStorage` permite promesa).
 * - Migración: la sesión guardada antes de este cambio vive en localStorage;
 *   el primer `getItem` la sube a SecureStore y borra el original, así que
 *   nadie pierde la sesión al actualizar la app.
 * - `removeItem`: SecureStore no tiene borrado síncrono, así que vaciamos la
 *   clave de inmediato (nadie leerá el token que acabamos de cerrar) y borramos
 *   la clave y sus trozos en una cola en segundo plano; una escritura que
 *   llegue con el borrado en vuelo se rehace después de él.
 */
type AlmacenSesion = {
  getItem: (clave: string) => string | null | Promise<string | null>;
  setItem: (clave: string, valor: string) => void | Promise<void>;
  removeItem: (clave: string) => void | Promise<void>;
};

type ModoSeguro = 'sync' | 'cache' | 'ninguno';

/** Límite de valor que admite SecureStore, en bytes UTF-8. */
const LIMITE_VALOR = 2048;

/** Marca de valor troceado: supabase guarda JSON, nunca empieza por `#`. */
const MARCA_TROCEOS = '#troceos:';

/** SecureStore solo admite `[\\w.-]` en la clave; el resto lo igualamos. */
const CARACTERES_NO_PERMITIDOS = /[^\w.-]/g;

let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  // Build sin el módulo nativo: nos quedamos con localStorage (sin crashear)
  SecureStore = null;
}

/** ¿La clave contiene token? Eso decide si se guarda cifrada. */
function claveSecreta(clave: string): boolean {
  return /auth-token|refresh/i.test(clave);
}

/** Traduce la clave lógica a una clave válida para SecureStore. */
function nombreSeguro(clave: string): string {
  return clave.replace(CARACTERES_NO_PERMITIDOS, '_');
}

/** Claves que SecureStore no pudo usar en esta ejecución (se ignoran). */
const clavesRotas = new Set<string>();

/** Claves con un borrado en vuelo en la cola de SecureStore. */
const borradosPendientes = new Set<string>();
let colaBorrados: Promise<void> = Promise.resolve();

let modoActual: ModoSeguro | null = null;

/** ¿La API síncrona de SecureStore responde en esta build? (se sondea una vez) */
function modoSeguro(): ModoSeguro {
  if (modoActual) return modoActual;
  if (!SecureStore) {
    modoActual = 'ninguno';
    return modoActual;
  }
  if (typeof SecureStore.getItem === 'function' && typeof SecureStore.setItem === 'function') {
    try {
      // Si el módulo nativo no está, esta llamada lanza y probamos otra vía
      SecureStore.getItem('sondeo-mantirenfe');
      modoActual = 'sync';
      return modoActual;
    } catch {
      // sin API síncrona usable
    }
  }
  if (
    typeof SecureStore.getItemAsync === 'function' &&
    typeof SecureStore.setItemAsync === 'function'
  ) {
    modoActual = 'cache';
    return modoActual;
  }
  modoActual = 'ninguno';
  return modoActual;
}

/** Tamaño en bytes UTF-8 (SecureStore mide en bytes, no en caracteres). */
function bytesUtf8(texto: string): number {
  let total = 0;
  for (let i = 0; i < texto.length; i++) {
    const codigo = texto.charCodeAt(i);
    if (codigo < 0x80) total += 1;
    else if (codigo < 0x800) total += 2;
    else if (codigo >= 0xd800 && codigo <= 0xdbff) {
      total += 4;
      i++; // par surrogate: dos caracteres, cuatro bytes
    } else total += 3;
  }
  return total;
}

/** Trocea un valor largo en trozos que SecureStore pueda guardar por separado. */
function trocear(valor: string): string[] {
  const trozos: string[] = [];
  let actual = '';
  let bytes = 0;
  for (const caracter of valor) {
    const size = bytesUtf8(caracter);
    if (bytes + size > LIMITE_VALOR) {
      trozos.push(actual);
      actual = '';
      bytes = 0;
    }
    actual += caracter;
    bytes += size;
  }
  if (actual) trozos.push(actual);
  return trozos;
}

/** Lee de SecureStore reensamblando los trozos si el valor estaba troceado. */
function leerSeguro(clave: string): string | null {
  const ss = SecureStore;
  if (!ss) return null;
  const base = nombreSeguro(clave);
  const bruto = ss.getItem(base);
  if (!bruto) return null; // ausente o vaciado por removeItem
  if (!bruto.startsWith(MARCA_TROCEOS)) return bruto;
  const piezas = Number(bruto.slice(MARCA_TROCEOS.length));
  if (!Number.isInteger(piezas) || piezas < 1) return null;
  let valor = '';
  for (let i = 1; i <= piezas; i++) {
    const trozo = ss.getItem(`${base}-derived-${i}`);
    if (!trozo) return null; // trozo perdido: mejor sin sesión que a medias
    valor += trozo;
  }
  return valor;
}

/** Escribe en SecureStore troceando si el valor supera el límite. */
function escribirSeguro(clave: string, valor: string): void {
  const ss = SecureStore;
  if (!ss) throw new Error('SecureStore no disponible');
  const base = nombreSeguro(clave);
  if (bytesUtf8(valor) <= LIMITE_VALOR) {
    ss.setItem(base, valor);
    return;
  }
  // Primero los trozos y después la marca: si nos cortan a mitad, nadie lee
  // una marca que apunta a trozos que aún no existen.
  const trozos = trocear(valor);
  trozos.forEach((trozo, i) => ss.setItem(`${base}-derived-${i + 1}`, trozo));
  ss.setItem(base, `${MARCA_TROCEOS}${trozos.length}`);
}

/** Claves a borrar para una clave lógica: la principal y sus trozos. */
function clavesDeBorrado(clave: string): string[] {
  const ss = SecureStore;
  const base = nombreSeguro(clave);
  if (!ss) return [base];
  try {
    const bruto = ss.getItem(base);
    const piezas = bruto?.startsWith(MARCA_TROCEOS) ? Number(bruto.slice(MARCA_TROCEOS.length)) : 0;
    if (Number.isInteger(piezas) && piezas > 0) {
      return [base, ...Array.from({ length: piezas }, (_, i) => `${base}-derived-${i + 1}`)];
    }
  } catch {
    // sin marca legible: solo podemos borrar la clave principal
  }
  return [base];
}

function encolarBorrado(claves: string[]): void {
  const ss = SecureStore;
  if (!ss) return;
  claves.forEach((c) => borradosPendientes.add(c));
  colaBorrados = colaBorrados.then(async () => {
    for (const clave of claves) {
      try {
        await ss.deleteItemAsync(clave);
      } catch {
        // Si el sistema no deja borrar, lo intentará la próxima escritura
      } finally {
        borradosPendientes.delete(clave);
      }
    }
  });
}

/**
 * Un borrado en vuelo puede ejecutarse después de esta escritura y dejar la
 * clave vacía: si había uno pendiente, se rehace la escritura al cerrar la
 * cola (y no, si mientras tanto llegó otro borrado posterior, que gana).
 */
function reescribirTrasBorrado(clave: string, valor: string): void {
  const base = nombreSeguro(clave);
  if (!borradosPendientes.has(base)) return;
  colaBorrados = colaBorrados.then(() => {
    if (borradosPendientes.has(base)) return;
    try {
      escribirSeguro(clave, valor);
    } catch {
      clavesRotas.add(clave);
    }
  });
}

function borrarLocalStorage(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    // Un fallo aquí no debe echar atrás el guardado en SecureStore
  }
}

/**
 * Lectura síncrona de una clave secreta: SecureStore primero y, si no tiene
 * nada, la sesión guardada en localStorage de antes (y se migra).
 */
function leerSecretaSync(clave: string): string | null {
  if (clavesRotas.has(clave)) return localStorage.getItem(clave);
  try {
    const valor = leerSeguro(clave);
    if (valor !== null) return valor;
  } catch {
    // Keystore ilegible (p. ej. app reinstalada): confiamos en localStorage
    clavesRotas.add(clave);
    return localStorage.getItem(clave);
  }
  const viejo = localStorage.getItem(clave);
  if (!viejo) return null;
  try {
    escribirSeguro(clave, viejo);
    borrarLocalStorage(clave);
  } catch {
    // Si SecureStore no pudo guardarla, se queda en localStorage como siempre
    clavesRotas.add(clave);
  }
  return viejo;
}

/* ── Respaldo sin API síncrona: caché en memoria + persistencia en background */

const cacheSegura = new Map<string, string>();
let preparandoCache: Promise<void> | null = null;
let colaCache: Promise<void> = Promise.resolve();

/** Clave de sesión que usa supabase-js con esta URL (para precargar la caché). */
function claveSesionSupabase(): string {
  try {
    return `sb-${new URL(url ?? '').hostname.split('.')[0]}-auth-token`;
  } catch {
    return 'supabase.auth.token';
  }
}

async function leerSeguroAsync(clave: string): Promise<string | null> {
  const ss = SecureStore;
  if (!ss) return null;
  const base = nombreSeguro(clave);
  const bruto = await ss.getItemAsync(base);
  if (!bruto) return null;
  if (!bruto.startsWith(MARCA_TROCEOS)) return bruto;
  const piezas = Number(bruto.slice(MARCA_TROCEOS.length));
  if (!Number.isInteger(piezas) || piezas < 1) return null;
  let valor = '';
  for (let i = 1; i <= piezas; i++) {
    const trozo = await ss.getItemAsync(`${base}-derived-${i}`);
    if (!trozo) return null;
    valor += trozo;
  }
  return valor;
}

async function escribirSeguroAsync(clave: string, valor: string): Promise<void> {
  const ss = SecureStore;
  if (!ss) return;
  const base = nombreSeguro(clave);
  if (bytesUtf8(valor) <= LIMITE_VALOR) {
    await ss.setItemAsync(base, valor);
    return;
  }
  const trozos = trocear(valor);
  for (let i = 0; i < trozos.length; i++) {
    await ss.setItemAsync(`${base}-derived-${i + 1}`, trozos[i]);
  }
  await ss.setItemAsync(base, `${MARCA_TROCEOS}${trozos.length}`);
}

async function borrarSeguroAsync(clave: string): Promise<void> {
  const ss = SecureStore;
  if (!ss) return;
  const base = nombreSeguro(clave);
  const claves = [base];
  try {
    const bruto = await ss.getItemAsync(base);
    const piezas = bruto?.startsWith(MARCA_TROCEOS) ? Number(bruto.slice(MARCA_TROCEOS.length)) : 0;
    if (Number.isInteger(piezas) && piezas > 0) {
      for (let i = 1; i <= piezas; i++) claves.push(`${base}-derived-${i + 1}`);
    }
  } catch {
    // sin marca legible: solo la clave principal
  }
  for (const k of claves) {
    try {
      await ss.deleteItemAsync(k);
    } catch {
      // best effort
    }
  }
}

/**
 * Precarga la caché con la sesión y los verificadores PKCE que haya en
 * SecureStore (los flujos pendientes se listan en el índice de flujos).
 */
async function cargarCache(): Promise<void> {
  const ss = SecureStore;
  if (!ss) return;
  const base = claveSesionSupabase();
  const claves = [base, `${base}-code-verifier`, `${base}-flows-code-verifier`];
  try {
    const indice = await ss.getItemAsync(`${base}-flows-code-verifier`);
    const flujos: unknown = indice ? JSON.parse(indice) : [];
    if (Array.isArray(flujos)) {
      for (const flujo of flujos) {
        if (typeof flujo === 'string') claves.push(`${base}-flow-${flujo}-code-verifier`);
      }
    }
  } catch {
    // sin índice: seguimos con las claves fijas
  }
  for (const clave of claves) {
    try {
      const valor = await leerSeguroAsync(clave);
      if (valor) cacheSegura.set(clave, valor);
    } catch {
      // clave ilegible: se comporta como ausente
    }
  }
}

function prepararCache(): Promise<void> {
  if (!preparandoCache) preparandoCache = cargarCache().catch(() => undefined);
  return preparandoCache;
}

function leerCache(clave: string): string | null {
  const enCache = cacheSegura.get(clave);
  if (enCache !== undefined) return enCache;
  // Sesión guardada antes de este cambio: se sube y se deja de usar
  const viejo = localStorage.getItem(clave);
  if (viejo) {
    cacheSegura.set(clave, viejo);
    borrarLocalStorage(clave);
    colaCache = colaCache.then(() => escribirSeguroAsync(clave, viejo)).catch(() => undefined);
  }
  return viejo;
}

function escribirCache(clave: string, valor: string): void {
  cacheSegura.set(clave, valor);
  colaCache = colaCache.then(() => escribirSeguroAsync(clave, valor)).catch(() => undefined);
}

function borrarCache(clave: string): void {
  cacheSegura.delete(clave);
  colaCache = colaCache.then(() => borrarSeguroAsync(clave)).catch(() => undefined);
}

/* ── Adaptador expuesto a supabase-js */

const almacenSesion: AlmacenSesion = {
  getItem(clave) {
    if (!claveSecreta(clave)) return localStorage.getItem(clave);
    const modo = modoSeguro();
    if (modo === 'sync') return leerSecretaSync(clave);
    if (modo === 'cache') return prepararCache().then(() => leerCache(clave));
    return localStorage.getItem(clave);
  },
  setItem(clave, valor) {
    if (!claveSecreta(clave)) {
      localStorage.setItem(clave, valor);
      return;
    }
    const modo = modoSeguro();
    if (modo === 'cache') {
      void prepararCache().then(() => escribirCache(clave, valor));
      return;
    }
    if (modo === 'sync') {
      try {
        escribirSeguro(clave, valor);
        clavesRotas.delete(clave);
        // SecureStore ya tiene la copia buena: la de localStorage sobra
        borrarLocalStorage(clave);
        reescribirTrasBorrado(clave, valor);
        return;
      } catch {
        // SecureStore no pudo: esta clave pasa a localStorage en esta ejecución
        clavesRotas.add(clave);
      }
    }
    localStorage.setItem(clave, valor);
  },
  removeItem(clave) {
    if (!claveSecreta(clave)) {
      localStorage.removeItem(clave);
      return;
    }
    const modo = modoSeguro();
    if (modo === 'sync') {
      try {
        // Primero la lista de trozos (lee la marca antes de vaciar la clave)
        const aBorrar = clavesDeBorrado(clave);
        // SecureStore no borra en frío: vaciar la clave ya oculta el token
        SecureStore?.setItem(nombreSeguro(clave), '');
        encolarBorrado(aBorrar);
      } catch {
        clavesRotas.add(clave);
      }
    } else if (modo === 'cache') {
      // Tras la precarga: si no, la caché podría cargar el valor ya borrado
      void prepararCache().then(() => borrarCache(clave));
    }
    borrarLocalStorage(clave);
  },
};

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: almacenSesion,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          // PKCE es obligatorio para el OAuth con deep link: sin él, la vuelta
          // de Google trae tokens en el fragmento y login-callback no encuentra
          // el `code` que intercambia por la sesión.
          flowType: 'pkce',
        },
      })
    : null;

if (supabase) {
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
