import { z } from 'zod';

export const sesionUsuarioSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  nombre: z.string().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export type SesionUsuario = z.infer<typeof sesionUsuarioSchema>;

export const preferenciasUsuarioSchema = z.object({
  notificacionesPush: z.boolean().default(true),
  notificacionesEmail: z.boolean().default(false),
  recordatorioSalida: z.boolean().default(true),
  minutosRecordatorio: z.number().int().min(5).max(180).default(50),
  tema: z.enum(['claro', 'oscuro', 'sistema']).default('sistema'),
});

export type PreferenciasUsuario = z.infer<typeof preferenciasUsuarioSchema>;
