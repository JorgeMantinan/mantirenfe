import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AlertaResponse, EstadoSerializado } from '@mantirenfe/shared-types';
import { Tarjeta } from '@/components/Tarjeta';
import { FichaAlerta } from '@/components/alertas/FichaAlerta';
import { SeccionPrecios } from '@/components/alertas/SeccionPrecios';
import { TarjetaEstado } from '@/components/alertas/TarjetaEstado';
import { estilosDetalle } from '@/components/alertas/estilos';
import type { SeriePrecio } from '@/lib/precios';
import { useTema } from '@/lib/tema-contexto';
import { espaciado } from '@/lib/tema';

type Props = {
  alerta: AlertaResponse | null;
  error: string | null;
  trenes: EstadoSerializado[];
  seriesPrecios: SeriePrecio[];
  /** Enseñar la evolución: disponibilidad, precio o datos de histórico. */
  verEvolucion: boolean;
  onCompartir: () => void;
  onCalendario: () => void;
};

/**
 * Cabecera de la lista de avisos: error, ficha, estado de hoy, evolución de
 * precios y rótulo de avisos. Vive memoizada en la pantalla (con los mismos
 * datos como dependencias) para que el pull-to-refresh, que solo cambia
 * `cargando`, no repinte la ficha ni la tabla de trenes.
 */
export function CabeceraViaje({
  alerta,
  error,
  trenes,
  seriesPrecios,
  verEvolucion,
  onCompartir,
  onCalendario,
}: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosDetalle(paleta), [paleta]);
  return (
    <View style={{ gap: espaciado.sm }}>
      {error ? (
        <Tarjeta style={{ borderColor: paleta.error }}>
          <Text style={{ color: paleta.error }}>{error}</Text>
        </Tarjeta>
      ) : null}

      {alerta ? (
        <FichaAlerta alerta={alerta} onCompartir={onCompartir} onCalendario={onCalendario} />
      ) : null}

      {alerta ? <TarjetaEstado alerta={alerta} trenes={trenes} /> : null}

      {alerta && verEvolucion ? <SeccionPrecios series={seriesPrecios} /> : null}

      <Text style={s.subtitulo}>{t('detalle.avisosTitulo')}</Text>
    </View>
  );
}
