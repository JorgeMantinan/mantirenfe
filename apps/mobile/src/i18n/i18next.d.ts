import 'i18next';
import type { Claves } from './es';
import type { MismoArbol } from './en';

/**
 * Claves tipadas: `t('ruta.del.texto')` solo compila si la clave existe en el
 * diccionario ES, y el tipo de retorno es `string`.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: MismoArbol<Claves> };
  }
}
