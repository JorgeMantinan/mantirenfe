import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CRITERIOS, etiquetasDeCriterios, type Criterio } from '@/lib/alertas';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  /** Criterios marcados (la multi-selección vive en la pantalla). */
  criterios: Criterio[];
  /** Bloquea los toques mientras se carga la alerta en modo edición. */
  cargandoEdicion: boolean;
  onAlternar: (valor: Criterio) => void;
};

/** «Tipo de aviso»: multi-selección de criterios con sus descripciones debajo. */
export function ChipsCriterio({ criterios, cargandoEdicion, onAlternar }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);

  const etiquetas = etiquetasDeCriterios();
  const descripciones: Record<Criterio, string> = {
    DISPONIBILIDAD: t('nueva.desc.disponibilidad'),
    RETRASO: t('nueva.desc.retraso'),
    HORARIO: t('nueva.desc.horario'),
    APERTURA_VENTA: t('nueva.desc.aperturaVenta'),
    PRECIO: t('nueva.desc.precio'),
  };

  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.tipoAviso')}</Text>
      <View style={s.chips}>
        {CRITERIOS.map((valor) => {
          const marcado = criterios.includes(valor);
          return (
            <Text
              key={valor}
              style={[s.chip, marcado && s.chipActivo, cargandoEdicion && { opacity: 0.5 }]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marcado, disabled: cargandoEdicion }}
              onPress={() => onAlternar(valor)}
            >
              {etiquetas[valor]}
            </Text>
          );
        })}
      </View>
      <Text style={s.pista}>{criterios.map((c) => descripciones[c]).join(' · ')}</Text>
      <Text style={s.pista}>{t('nueva.criterioPista')}</Text>
    </>
  );
}
