import { api } from './api';

export async function desuscribirPush(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return;
  }
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) return;
    await api('/notificaciones/push-unsubscribe', {
      method: 'POST',
      json: { endpoint: suscripcion.endpoint },
    });
    await suscripcion.unsubscribe();
  } catch {
    // el logout no debe bloquearse por push
  }
}
