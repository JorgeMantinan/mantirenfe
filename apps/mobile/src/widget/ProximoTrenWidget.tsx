import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { t } from '@/i18n';
import { etiquetaDia, fechaCorta, type DatosWidget } from '@/lib/widget';

const FONDO = '#75258c';
const BLANCO = '#ffffff';
const BLANCO_SUAVE = 'rgba(255, 255, 255, 0.75)';

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
            datos?.proximoViaje
              ? t('widget.proximoViaje', { fecha: fechaCorta(datos.proximoViaje) })
              : t('widget.sinSalidas')
          }
          style={{ color: BLANCO_SUAVE, fontSize: 13 }}
          maxLines={3}
        />
      ) : (
        salidas.map((salida) => {
          const dia = etiquetaDia(salida.fecha ?? datos?.fecha ?? '', hoy);
          return (
            <TextWidget
              key={`${salida.salidaIso}-${salida.numeroTren}`}
              text={`${dia ? `${dia} · ` : ''}${salida.salida} · ${salida.numeroTren} · ${salida.origen} → ${salida.destino}`}
              style={{ color: BLANCO, fontSize: 14, fontWeight: '600' }}
              truncate="END"
              maxLines={2}
            />
          );
        })
      )}
    </FlexWidget>
  );
}
