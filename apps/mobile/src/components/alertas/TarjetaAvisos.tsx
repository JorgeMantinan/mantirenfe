import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AvisoAlertaResponse } from '@mantirenfe/shared-types';
import { Etiqueta, Tarjeta } from '@/components/Tarjeta';
import { estilosDetalle } from '@/components/alertas/estilos';
import { locale } from '@/i18n';
import { useTema } from '@/lib/tema-contexto';

/**
 * Fila de avisos de la lista: con `React.memo` el pull-to-refresh (que solo
 * cambia `cargando`) no vuelve a construir cada tarjeta.
 */
export const TarjetaAvisos = memo(function TarjetaAvisos({
  aviso,
}: {
  aviso: AvisoAlertaResponse;
}) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosDetalle(paleta), [paleta]);
  return (
    <Tarjeta style={aviso.leida ? { opacity: 0.75 } : undefined}>
      <View style={s.fila}>
        <Text style={s.notiTitulo}>{aviso.titulo}</Text>
        {!aviso.leida ? <Etiqueta tono="primario">{t('comunes.nuevo')}</Etiqueta> : null}
      </View>
      <Text style={s.detalle}>{aviso.cuerpo}</Text>
      <Text style={s.fecha}>{new Date(aviso.creadaEn).toLocaleString(locale())}</Text>
    </Tarjeta>
  );
});
