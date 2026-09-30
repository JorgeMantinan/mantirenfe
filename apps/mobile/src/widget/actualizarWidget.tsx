import type { AlertaResponse } from '@mantirenfe/shared-types';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import {
  calcularSalidasWidget,
  guardarDatosWidget,
  leerDatosWidget,
  NOMBRE_WIDGET,
  NOMBRE_WIDGET_MINI,
  type DatosWidget,
} from '@/lib/widget';
import { ProximoTrenMini } from './ProximoTrenMini';
import { ProximoTrenWidget } from './ProximoTrenWidget';

/**
 * Escribe las próximas salidas en el caché del dispositivo y pinta los widgets
 * al momento (el grande y el mini comparten caché y cálculo). Solo Android:
 * en iOS/web no hay widget de pantalla de inicio.
 */
export async function sincronizarWidget(
  alertas: AlertaResponse[],
  ahora: Date = new Date(),
): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const datos = calcularSalidasWidget(alertas, ahora);
    await guardarDatosWidget(datos);
    for (const widgetName of [NOMBRE_WIDGET, NOMBRE_WIDGET_MINI]) {
      await requestWidgetUpdate({
        widgetName,
        renderWidget: () => pinta(widgetName, datos),
      });
    }
  } catch {
    // Sin widget en la pantalla de inicio (u error nativo): lo retoma el
    // refresco periódico del propio widget (updatePeriodMillis).
  }
}

/**
 * Vuelve a pintar el widget con lo que ya está en caché, sin consultar la API:
 * se usa al cambiar el idioma, que el widget no percibe por sí solo (no monta
 * React ni `useTranslation`).
 */
export async function repintarWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const datos = await leerDatosWidget();
    if (!datos) return;
    for (const widgetName of [NOMBRE_WIDGET, NOMBRE_WIDGET_MINI]) {
      await requestWidgetUpdate({
        widgetName,
        renderWidget: () => pinta(widgetName, datos),
      });
    }
  } catch {
    // El refresco periódico del propio widget retoma el resto
  }
}

function pinta(widgetName: string, datos: DatosWidget) {
  return widgetName === NOMBRE_WIDGET_MINI ? (
    <ProximoTrenMini datos={datos} />
  ) : (
    <ProximoTrenWidget datos={datos} />
  );
}
