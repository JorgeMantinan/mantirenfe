import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import {
  filtrarSalidasVigentes,
  leerDatosWidget,
  NOMBRE_WIDGET_MINI,
  type DatosWidget,
} from '@/lib/widget';
import { ProximoTrenMini } from './ProximoTrenMini';
import { ProximoTrenWidget } from './ProximoTrenWidget';

/**
 * Se ejecuta en tarea JS en segundo plano (WorkManager) cuando Android añade,
 * actualiza (cada 30 min), redimensiona o pulsa un widget. El mismo handler
 * atiende a los dos widgets de app.json (grande y mini): se sirve del caché que
 * la app escribe al cargar alertas (no hay sesión Supabase aquí).
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;

  try {
    const datos = await leerDatosWidget();
    const vigentes = datos ? filtrarSalidasVigentes(datos) : null;
    props.renderWidget(pinta(props.widgetInfo.widgetName, vigentes));
  } catch {
    // Mejor un widget en su estado vacío que uno transparente: si el cálculo
    // o el pintado fallan (dato inesperado, caché corrupta...), el launcher
    // se queda con este último render y el próximo ciclo lo retoma.
    try {
      props.renderWidget(pinta(props.widgetInfo.widgetName, null));
    } catch {
      // Sin render posible: el updatePeriodMillis del launcher lo reintenta
    }
  }
}

function pinta(widgetName: string, datos: DatosWidget | null) {
  return widgetName === NOMBRE_WIDGET_MINI ? (
    <ProximoTrenMini datos={datos} />
  ) : (
    <ProximoTrenWidget datos={datos} />
  );
}
