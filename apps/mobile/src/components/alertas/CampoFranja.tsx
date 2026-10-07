import { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';
import { espaciado } from '@/lib/tema';

type Props = {
  horaDesde: string;
  horaHasta: string;
  onHoraDesde: (hora: string) => void;
  onHoraHasta: (hora: string) => void;
};

/** «Franja horaria»: las dos horas de la ida y su pista (solo es un aviso). */
export function CampoFranja({ horaDesde, horaHasta, onHoraDesde, onHoraHasta }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.franja')}</Text>
      <View style={{ flexDirection: 'row', gap: espaciado.sm }}>
        <TextInput
          style={[s.campo, { flex: 1 }]}
          placeholder={t('nueva.desdeHora')}
          placeholderTextColor={paleta.textoSecundario}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          value={horaDesde}
          onChangeText={onHoraDesde}
        />
        <TextInput
          style={[s.campo, { flex: 1 }]}
          placeholder={t('nueva.hastaHora')}
          placeholderTextColor={paleta.textoSecundario}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          value={horaHasta}
          onChangeText={onHoraHasta}
        />
      </View>
      <Text style={s.pista}>{t('nueva.soloFranja')}</Text>
    </>
  );
}
