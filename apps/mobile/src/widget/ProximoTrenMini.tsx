import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { t } from '@/i18n';
import { resumenWidget, type DatosWidget } from '@/lib/widget';

const FONDO = '#75258c';
const BLANCO = '#ffffff';
const BLANCO_SUAVE = 'rgba(255, 255, 255, 0.75)';

/**
 * Widget compacto (2×2): la próxima salida en grande, su tren y la ruta
 * (o el estado vacío). Misma caché y mismo cálculo que el widget grande.
 */
export function ProximoTrenMini({ datos }: { datos: DatosWidget | null }) {
  const resumen = resumenWidget(datos, new Date());

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
