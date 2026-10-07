import { useMemo } from 'react';
import { Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  valor: string;
  onCambiar: (texto: string) => void;
};

/** Campo «Notas»: texto libre de una alerta (multilinea). */
export function CampoNotas({ valor, onCambiar }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.notas')}</Text>
      <TextInput
        style={[s.campo, s.notas]}
        placeholder={t('nueva.placeholderNotas')}
        placeholderTextColor={paleta.textoSecundario}
        multiline
        value={valor}
        onChangeText={onCambiar}
      />
    </>
  );
}
