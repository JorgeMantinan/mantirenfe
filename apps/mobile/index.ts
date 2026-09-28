import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/tareaWidget';

// El handler se registra en el entry para que la tarea JS en segundo plano
// (WorkManager) pueda pintar el widget aunque la app no esté en pantalla.
registerWidgetTaskHandler(widgetTaskHandler);
