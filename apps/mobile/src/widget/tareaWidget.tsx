import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { filtrarSalidasVigentes, leerDatosWidget } from '@/lib/widget';
import { ProximoTrenWidget } from './ProximoTrenWidget';

/**
 * Se ejecuta en tarea JS en segundo plano (WorkManager) cuando Android añade,
 * actualiza (cada 30 min), redimensiona o pulsa el widget. No hay sesión
 * Supabase aquí: se sirve del caché que la app escribe al cargar alertas.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;

  const datos = await leerDatosWidget();
  const vigentes = datos ? filtrarSalidasVigentes(datos) : null;
  props.renderWidget(<ProximoTrenWidget datos={vigentes} />);
}
