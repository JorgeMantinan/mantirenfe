import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import { t } from '@/i18n';
import {
  estadoSalidaWidget,
  resumenWidget,
  type DatosWidget,
  type TonoEstadoWidget,
} from '@/lib/widget';

const FONDO = '#75258c';
const BLANCO = '#ffffff';
const BLANCO_SUAVE = 'rgba(255, 255, 255, 0.75)';
/** Badges de estado sobre el morado: misma gama clara que la app en oscuro. */
const VERDE = '#4ade80';
const ROJO = '#fca5a5';
const GRIS = 'rgba(255, 255, 255, 0.55)';

const COLOR_ESTADO = {
  exito: VERDE,
  error: ROJO,
  neutro: GRIS,
  sinDatos: GRIS,
} satisfies Record<TonoEstadoWidget, ColorProp>;

/**
 * Widget compacto (2×2): la próxima salida en grande, su tren y la ruta
 * (o el estado vacío), con el badge corto de plazas/cancelado bajo la hora.
 * Misma caché y mismo cálculo que el widget grande; si la salida no trae
 * datos de estado no se pinta la línea y queda como estaba.
 */
export function ProximoTrenMini({ datos }: { datos: DatosWidget | null }) {
  const resumen = resumenWidget(datos, new Date());
  const estado = estadoSalidaWidget(datos?.salidas?.[0], { corto: true });
  const hayEstado = estado.tono !== 'sinDatos';

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={t('widget.accesibilidad')}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        flexGap: 2,
        backgroundColor: FONDO,
        borderRadius: 16,
        padding: 10,
      }}
    >
      {resumen.vacio ? (
        <TextWidget
          text={resumen.vacio}
          style={{ color: BLANCO_SUAVE, fontSize: 13, fontWeight: '600' }}
          maxLines={3}
        />
      ) : (
        <>
          {/* Solo si la salida no es hoy hace falta decir el día */}
          {resumen.dia ? (
            <TextWidget
              text={resumen.dia.toUpperCase()}
              style={{ color: BLANCO_SUAVE, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}
              maxLines={1}
            />
          ) : null}
          <TextWidget
            text={resumen.hora ?? ''}
            style={{ color: BLANCO, fontSize: 30, fontWeight: '800' }}
            maxLines={1}
          />
          {hayEstado ? (
            <TextWidget
              text={estado.texto}
              style={{ color: COLOR_ESTADO[estado.tono], fontSize: 11, fontWeight: '700' }}
              truncate="END"
              maxLines={1}
            />
          ) : null}
          <TextWidget
            text={resumen.numeroTren ?? ''}
            style={{ color: BLANCO, fontSize: 14, fontWeight: '700' }}
            truncate="END"
            maxLines={1}
          />
          <TextWidget
            text={resumen.ruta ?? ''}
            style={{ color: BLANCO_SUAVE, fontSize: 12 }}
            truncate="END"
            maxLines={2}
          />
        </>
      )}
    </FlexWidget>
  );
}
