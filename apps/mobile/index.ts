import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/tareaWidget';

// Un único handler para los dos widgets de app.json (ProximoTren y
// ProximoTrenMini): `widgetTaskHandler` pinta uno u otro según el nombre y
// comparte la caché de salidas. La tarea JS en segundo plano (WorkManager)
// así puede pintarlos aunque la app no esté en pantalla.
registerWidgetTaskHandler(widgetTaskHandler);
