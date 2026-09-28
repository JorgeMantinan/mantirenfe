import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { filtrarSalidasVigentes, leerDatosWidget, NOMBRE_WIDGET_MINI } from '@/lib/widget';
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

  const datos = await leerDatosWidget();
  const vigentes = datos ? filtrarSalidasVigentes(datos) : null;
  const widget =
    props.widgetInfo.widgetName === NOMBRE_WIDGET_MINI ? (
      <ProximoTrenMini datos={vigentes} />
    ) : (
      <ProximoTrenWidget datos={vigentes} />
    );
  props.renderWidget(widget);
}
