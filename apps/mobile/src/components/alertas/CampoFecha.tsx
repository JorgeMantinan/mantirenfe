import { useMemo } from 'react';
import { Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BotonElegirFecha } from '@/components/alertas/SelectorFechaNativa';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  valor: string;
  fechaMin: string;
  onCambiar: (texto: string) => void;
  onAbrirSelector: () => void;
};

/** Campo «Fecha de viaje»: texto a mano, mínimo y enlace al calendario nativo. */
export function CampoFecha({ valor, fechaMin, onCambiar, onAbrirSelector }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.fechaViaje')}</Text>
      <TextInput
        style={s.campo}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={paleta.textoSecundario}
        keyboardType="numbers-and-punctuation"
        value={valor}
        onChangeText={onCambiar}
      />
      <Text style={s.pista}>{t('nueva.minimo', { fecha: fechaMin })}</Text>
      <BotonElegirFecha onPress={onAbrirSelector} />
    </>
  );
}
