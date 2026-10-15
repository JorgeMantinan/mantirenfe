import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';
import { t } from '@/i18n';
import {
  estadoSalidaWidget,
  etiquetaDia,
  fechaCorta,
  retrasoWidget,
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
 * Widget grande (4×2): hasta tres salidas, cada una en DOS líneas para que la
 * ruta se lea entera (hora+tren arriba con los badges, «origen → destino»
 * abajo con salto de línea si hace falta), más el badge de estado (color), la
 * llegada y el retraso.
 */
export function ProximoTrenWidget({ datos }: { datos: DatosWidget | null }) {
  const salidas = datos?.salidas ?? [];
  const hoy = new Date();

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={t('widget.accesibilidad')}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        flexGap: 6,
        backgroundColor: FONDO,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <TextWidget
        text={t('widget.titulo')}
        style={{ color: BLANCO, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}
      />
      {salidas.length === 0 ? (
        <TextWidget
          text={
            !datos
              ? t('widget.abreApp')
              : datos.proximoViaje
                ? t('widget.proximoViaje', { fecha: fechaCorta(datos.proximoViaje) })
                : t('widget.sinSalidas')
          }
          style={{ color: BLANCO_SUAVE, fontSize: 13 }}
          maxLines={3}
        />
      ) : (
        salidas.map((salida) => {
          const dia = etiquetaDia(salida.fecha ?? datos?.fecha ?? '', hoy);
          const estado = estadoSalidaWidget(salida);
          const llega = salida.horaLlegada ? t('widget.llega', { hora: salida.horaLlegada }) : null;
          const retraso = retrasoWidget(salida);
          return (
            <FlexWidget
              key={`${salida.salidaIso}-${salida.numeroTren}`}
              style={{ flexDirection: 'column', flexGap: 2 }}
            >
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FlexWidget style={{ flex: 1, width: 0 }}>
                  <TextWidget
                    text={`${dia ? `${dia} · ` : ''}${salida.salida} · ${salida.numeroTren}`}
                    style={{ color: BLANCO, fontSize: 14, fontWeight: '600' }}
                    truncate="END"
                    maxLines={1}
                  />
                </FlexWidget>
                <TextWidget
                  text={estado.texto}
                  style={{
                    color: COLOR_ESTADO[estado.tono],
                    fontSize: 11,
                    fontWeight: '700',
                    marginLeft: 6,
                  }}
                  truncate="END"
                  maxLines={1}
                />
                {llega ? (
                  <TextWidget
                    text={llega}
                    style={{ color: BLANCO_SUAVE, fontSize: 11, marginLeft: 6 }}
                    truncate="END"
                    maxLines={1}
                  />
                ) : null}
                {retraso !== null ? (
                  <TextWidget
                    text={t('widget.retraso', { min: retraso })}
                    style={{ color: ROJO, fontSize: 11, fontWeight: '700', marginLeft: 6 }}
                    truncate="END"
                    maxLines={1}
                  />
                ) : null}
              </FlexWidget>
              {/* La ruta entera, con salto de línea si no cabe en una */}
              <TextWidget
                text={`${salida.origen} → ${salida.destino}`}
                style={{ color: BLANCO_SUAVE, fontSize: 12 }}
                maxLines={2}
              />
            </FlexWidget>
          );
        })
      )}
    </FlexWidget>
  );
}
