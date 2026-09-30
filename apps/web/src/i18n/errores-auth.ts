import { i18n } from './index';

/**
 * Errores crudos de Supabase Auth traducidos al idioma activo. Las reglas son
 * las mismas que `traducirErrorAuth` de `shared-types` (que sigue siendo la
 * referencia para el móvil), pero resueltas contra los diccionarios de la web
 * para poder ofrecer también la versión EN. Si no se reconoce el mensaje, se
 * devuelve tal cual.
 */
type ClaveErrorAuth =
  | 'erroresAuth.credenciales'
  | 'erroresAuth.confirmarEmail'
  | 'erroresAuth.cuentaExiste'
  | 'erroresAuth.emailInvalido'
  | 'erroresAuth.passwordDebil'
  | 'erroresAuth.proveedor'
  | 'erroresAuth.registroDeshabilitado'
  | 'erroresAuth.limiteIntentos'
  | 'erroresAuth.emailNoAceptado';

const REGLAS: Array<[RegExp, ClaveErrorAuth]> = [
  [/invalid login credentials/, 'erroresAuth.credenciales'],
  [/email not confirmed|email_not_confirmed/, 'erroresAuth.confirmarEmail'],
  [/already registered|user_already_exists/, 'erroresAuth.cuentaExiste'],
  [/email_address_invalid/, 'erroresAuth.emailInvalido'],
  [/password should be at least|weak_password/, 'erroresAuth.passwordDebil'],
  [/provider is not enabled|unsupported provider/, 'erroresAuth.proveedor'],
  [/signups not allowed|signup is not allowed/, 'erroresAuth.registroDeshabilitado'],
  [/rate limit|too many requests|429/, 'erroresAuth.limiteIntentos'],
];

export function errorAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();
  for (const [patron, clave] of REGLAS) {
    if (patron.test(m)) return i18n.t(clave);
  }
  if (m.includes('is invalid') && m.includes('email')) {
    return i18n.t('erroresAuth.emailNoAceptado');
  }
  return mensaje;
}
