import type { AlertaResponse } from '@mantirenfe/shared-types';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { calcularSalidasWidget, guardarDatosWidget, NOMBRE_WIDGET } from '@/lib/widget';
import { ProximoTrenWidget } from './ProximoTrenWidget';

/**
 * Escribe las próximas salidas en el caché del dispositivo y pinta el widget
 * al momento. Solo Android: en iOS/web no hay widget de pantalla de inicio.
 */
export async function sincronizarWidget(
  alertas: AlertaResponse[],
  ahora: Date = new Date(),
): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const datos = calcularSalidasWidget(alertas, ahora);
    await guardarDatosWidget(datos);
    await requestWidgetUpdate({
      widgetName: NOMBRE_WIDGET,
      renderWidget: () => <ProximoTrenWidget datos={datos} />,
    });
  } catch {
    // Sin widget en la pantalla de inicio (u error nativo): lo retoma el
    // refresco periódico del propio widget (updatePeriodMillis).
  }
}
