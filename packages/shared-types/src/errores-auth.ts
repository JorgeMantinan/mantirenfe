/**
 * Traduce los errores crudos de Supabase Auth a mensajes útiles para la persona
 * usuaria. Devuelve el mensaje original si no lo reconoce.
 */
export function traducirErrorAuth(mensaje: string): string {
  const m = mensaje.toLowerCase();

  if (m.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos. Si acabas de crear la cuenta, comprueba que la contraseña sea la misma.';
  }
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) {
    return 'Falta confirmar el email: revisa tu bandeja de entrada (y spam).';
  }
  if (m.includes('already registered') || m.includes('user_already_exists')) {
    return 'Ya existe una cuenta con ese email. Inicia sesión en su lugar.';
  }
  if (m.includes('email_address_invalid')) {
    return 'Supabase rechaza ese email: revisa la lista de dominios permitidos en Authentication → Settings.';
  }
  if (m.includes('password should be at least') || m.includes('weak_password')) {
    return 'La contraseña es demasiado débil: usa al menos 8 caracteres.';
  }
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
    return 'Este proveedor de acceso (Google/Outlook) aún no está habilitado en Supabase → Authentication → Providers.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is not allowed')) {
    return 'El registro está deshabilitado en Supabase → Authentication → Settings.';
  }
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('429')) {
    return 'Demasiados intentos seguidos: espera un minuto y vuelve a probar.';
  }
  if (m.includes('is invalid') && m.includes('email')) {
    return 'Supabase no acepta ese email (puede estar en la lista de dominios bloqueados). Prueba con otro correo.';
  }
  return mensaje;
}
