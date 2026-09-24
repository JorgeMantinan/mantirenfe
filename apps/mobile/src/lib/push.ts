import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

export interface ResultadoRegistroPush {
  ok: boolean;
  error?: string;
}

function projectIdEas(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const easConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig;
  return extra?.eas?.projectId ?? easConfig?.projectId ?? null;
}

/**
 * Quita el token de este dispositivo de la API (el switch de avisos en off).
 */
export async function desregistrarPushMovil(): Promise<ResultadoRegistroPush> {
  try {
    const projectId = projectIdEas();
    if (!projectId) {
      return {
        ok: false,
        error: 'Falta el projectId de EAS: ejecuta "npx eas-cli init" en apps/mobile',
      };
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/notificaciones/push-token/unsubscribe', { method: 'POST', json: { token: data } });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Pide permisos, obtiene el Expo Push Token de este dispositivo y lo registra
 * en la API para que el worker envíe los avisos de las alertas.
 */
export async function registrarPushMovil(): Promise<ResultadoRegistroPush> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { ok: false, error: 'Los avisos push solo funcionan en iOS y Android' };
  }

  try {
    if (Platform.OS === 'android') {
      // En Android 13+ no aparece el diálogo de permisos sin un canal creado.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos de trenes',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#75258c',
      });
    }

    const permisos = await Notifications.getPermissionsAsync();
    let concedido = permisos.granted;
    if (!concedido) {
      const solicitud = await Notifications.requestPermissionsAsync();
      concedido = solicitud.granted;
    }
    if (!concedido) {
      return { ok: false, error: 'Permiso de notificaciones denegado' };
    }

    const projectId = projectIdEas();
    if (!projectId) {
      return {
        ok: false,
        error: 'Falta el projectId de EAS: ejecuta "npx eas-cli init" en apps/mobile',
      };
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/notificaciones/push-token', {
      method: 'POST',
      json: { token: data, plataforma: Platform.OS === 'ios' ? 'IOS' : 'ANDROID' },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
