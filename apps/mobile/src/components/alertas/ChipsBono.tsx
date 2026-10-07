import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BONOS } from '@mantirenfe/shared-types';
import { estilosNueva } from '@/components/alertas/estilos';
import { etiquetaBono } from '@/lib/alertas';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  bono: string;
  onElegir: (bono: string) => void;
};

/** «Bono / tarifa»: chips con el bono a vigilar y el aviso de letra pequeña. */
export function ChipsBono({ bono, onElegir }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.bono')}</Text>
      <View style={s.chips}>
        {BONOS.map((b) => (
          <Text key={b} style={[s.chip, bono === b && s.chipActivo]} onPress={() => onElegir(b)}>
            {etiquetaBono(b)}
          </Text>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: paleta.textoSecundario }}>{t('nueva.avisoBono')}</Text>
    </>
  );
}
