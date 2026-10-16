import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DatosWidget } from '../lib/widget';

/**
 * Mock del paquete: los componentes importan las primitivas de la raíz, que
 * en Node tiraría del módulo nativo. Se sustituyen por LAS REALES del src
 * (son puras: solo estilos y tipos), y `buildWidgetTree` —el renderizador
 * del launcher— se importa directo y también es puro.
 */
vi.mock('react-native-android-widget', async () => {
  const { FlexWidget } =
    await import('../../node_modules/react-native-android-widget/src/widgets/FlexWidget');
  const { TextWidget } =
    await import('../../node_modules/react-native-android-widget/src/widgets/TextWidget');
  return { FlexWidget, TextWidget };
});

import { buildWidgetTree } from '../../node_modules/react-native-android-widget/src/api/build-widget-tree';
import { ProximoTrenMini } from './ProximoTrenMini';
import { ProximoTrenWidget } from './ProximoTrenWidget';
import type { DatosWidget as Datos } from '../lib/widget';

const DATOS_CON_SALIDAS: Datos = {
  fecha: '2026-09-28',
  actualizadoEn: '2026-09-28T09:00:00.000Z',
  salidas: [
    {
      numeroTren: '01256A',
      origen: 'Madrid-Chamartín',
      destino: 'Valladolid-Campo Grande',
      salida: '10:15',
      salidaIso: '2026-09-28T10:15:00',
      fecha: '2026-09-28',
      disponible: true,
      precioMin: 25,
      horaLlegada: '12:30',
    },
  ],
};

const DATOS_VACIOS: Datos = {
  fecha: '2026-09-28',
  actualizadoEn: '2026-09-28T09:00:00.000Z',
  salidas: [],
  vacioMotivo: 'sin-estado',
};

describe('render de los widgets con el buildWidgetTree del launcher', () => {
  it('ProximoTrenMini pinta la próxima salida (regresión: sin fragments)', () => {
    expect(() =>
      buildWidgetTree(createElement(ProximoTrenMini, { datos: DATOS_CON_SALIDAS })),
    ).not.toThrow();
  });

  it('ProximoTrenMini pinta el estado vacío y con datos nulos', () => {
    expect(() =>
      buildWidgetTree(createElement(ProximoTrenMini, { datos: DATOS_VACIOS })),
    ).not.toThrow();
    expect(() => buildWidgetTree(createElement(ProximoTrenMini, { datos: null }))).not.toThrow();
  });

  it('ProximoTrenWidget pinta las salidas y el vacío', () => {
    expect(() =>
      buildWidgetTree(createElement(ProximoTrenWidget, { datos: DATOS_CON_SALIDAS })),
    ).not.toThrow();
    expect(() => buildWidgetTree(createElement(ProximoTrenWidget, { datos: null }))).not.toThrow();
  });

  it('un fragment <>…</> no se puede renderizar (la causa del mini)', () => {
    const fragmento = { type: Symbol.for('react.fragment'), props: {} } as never;
    expect(() => buildWidgetTree(fragmento)).toThrow();
  });
});
