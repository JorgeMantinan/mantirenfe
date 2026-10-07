import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { INTERVALOS_SONDEO_MIN } from '@mantirenfe/shared-types';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  intervalo: number;
  onElegir: (minutos: number) => void;
};

/** «Intervalo de sondeo»: chips con los intervalos que admite el schema. */
export function ChipsIntervalo({ intervalo, onElegir }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.intervalo')}</Text>
      <View style={s.chips}>
        {INTERVALOS_SONDEO_MIN.map((min) => (
          <Text
            key={min}
            style={[s.chip, intervalo === min && s.chipActivo]}
            onPress={() => onElegir(min)}
          >
            {min} min
          </Text>
        ))}
      </View>
    </>
  );
}
