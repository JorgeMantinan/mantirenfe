import { useMemo } from 'react';
import { Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  valor: string;
  onCambiar: (texto: string) => void;
};

/** «Precio objetivo»: solo se enseña con el criterio PRECIO marcado. */
export function CampoPrecio({ valor, onCambiar }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.precioObjetivo')}</Text>
      <TextInput
        style={s.campo}
        placeholder={t('nueva.placeholderPrecio')}
        placeholderTextColor={paleta.textoSecundario}
        keyboardType="decimal-pad"
        value={valor}
        onChangeText={onCambiar}
      />
    </>
  );
}
