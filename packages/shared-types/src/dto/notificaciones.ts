import { z } from 'zod';

export const suscripcionPushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
  plataforma: z.enum(['WEB', 'ANDROID', 'IOS']).default('WEB'),
});

export type SuscripcionPushInput = z.infer<typeof suscripcionPushSchema>;

export const pushTokenMovilSchema = z.object({
  token: z.string().min(1).max(512),
  plataforma: z.enum(['ANDROID', 'IOS']),
});

export type PushTokenMovilInput = z.infer<typeof pushTokenMovilSchema>;

export interface NotificacionResponse {
  id: string;
  titulo: string;
  cuerpo: string;
  datos: Record<string, unknown> | null;
  leida: boolean;
  creadaEn: string;
  alertaId: string | null;
}

export interface PushConfigResponse {
  publicKey: string;
}
