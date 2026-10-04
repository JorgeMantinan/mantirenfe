import { describe, expect, it } from 'vitest';
import { endpointPushSchema } from './notificaciones.service';

/**
 * Anti-SSRF del endpoint de una suscripción push: la API solo lo guarda, pero
 * después el worker hará un POST a esa URL, así que aquí se acota a `https://`
 * y a los notificadores de verdad. IPs, localhost y dominios parecidos quedan
 * fuera.
 */
function admitido(endpoint: string): boolean {
  return endpointPushSchema.safeParse(endpoint).success;
}

describe('endpointPushSchema (allowlist anti-SSRF)', () => {
  it('admite los notificadores push conocidos (exactos y subdominios)', () => {
    expect(admitido('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(admitido('https://web.push.apple.com/JF1FGi3x...')).toBe(true);
    expect(admitido('https://ap.push.apple.com/abc')).toBe(true);
    expect(admitido('https://updates.push.services.mozilla.com/wpush/v2.Q1x...')).toBe(true);
    expect(admitido('https://notify-api.line.me/api/notify')).toBe(true);
    // Sufijos admitidos: cualquier subdominio de esos dominios
    expect(admitido('https://servicio.push.apple.com/abc')).toBe(true);
    expect(admitido('https://proyecto.firebase.google.com/abc')).toBe(true);
  });

  it('rechaza cualquier esquema que no sea https estricto', () => {
    expect(admitido('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(admitido('ftp://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(admitido('file:///etc/passwd')).toBe(false);
    expect(admitido('fcm.googleapis.com/fcm/send/abc')).toBe(false);
  });

  it('rechaza IPs, localhost y dominios no listados', () => {
    expect(admitido('https://192.168.1.10/fcm')).toBe(false);
    expect(admitido('https://10.0.0.1/fcm')).toBe(false);
    expect(admitido('https://127.0.0.1/fcm')).toBe(false);
    expect(admitido('https://[::1]/fcm')).toBe(false);
    expect(admitido('https://2130706433/fcm')).toBe(false);
    expect(admitido('https://localhost/fcm')).toBe(false);
    expect(admitido('https://redis.interno/fcm')).toBe(false);
    expect(admitido('https://evil.com/fcm')).toBe(false);
  });

  it('no se cuele por sufijos que solo "parecen" los permitidos', () => {
    expect(admitido('https://fcm.googleapis.com.evil.com/fcm')).toBe(false);
    expect(admitido('https://notfcm.googleapis.com/fcm')).toBe(false);
    expect(admitido('https://mi-push.apple.com.es/fcm')).toBe(false);
  });

  it('rechaza basura y valores fuera de rango', () => {
    expect(admitido('')).toBe(false);
    expect(admitido('no es una url')).toBe(false);
    expect(admitido(`https://fcm.googleapis.com/${'a'.repeat(3000)}`)).toBe(false);
  });
});
