import { useMemo } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '@/components/Tarjeta';
import { estilosNueva } from '@/components/alertas/estilos';
import type { Resumen } from '@/lib/alertas';
import { useTema } from '@/lib/tema-contexto';
import { espaciado } from '@/lib/tema';

type Props = {
  origen: string;
  destino: string;
  /** Resumen calculado por la pantalla con los campos actuales. */
  resumen: Resumen;
};

/** Tarjeta «Resumen» bajo el formulario: ruta, criterios y próximas salidas. */
export function ResumenAlerta({ origen, destino, resumen }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <Tarjeta style={{ marginTop: espaciado.sm }}>
      <Text style={s.resumenTitulo}>{t('nueva.resumenTitulo')}</Text>
      <Text style={s.resumenRuta}>
        {origen.trim() || '—'} <Text style={{ color: paleta.primario }}>→</Text>{' '}
        {destino.trim() || '—'}
      </Text>
      <Text style={s.pista}>
        {[resumen.fecha, resumen.franja, resumen.criterio].filter(Boolean).join(' · ')}
      </Text>
      {resumen.salidas.length > 0 ? (
        <Text style={s.pista}>
          {t('nueva.proximasSalidas', { salidas: resumen.salidas.join(', ') })}
        </Text>
      ) : null}
    </Tarjeta>
  );
}
