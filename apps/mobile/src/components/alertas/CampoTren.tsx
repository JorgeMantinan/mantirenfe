import { useMemo } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { horaGtfs, type HorarioTrenResponse } from '@mantirenfe/shared-types';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  valor: string;
  /** Los 3 próximos trenes de la ruta (solo se enseñan con el campo vacío). */
  trenes: HorarioTrenResponse[];
  onCambiar: (texto: string) => void;
};

/** «Tren concreto»: número manual o chip con los próximos trenes sugeridos. */
export function CampoTren({ valor, trenes, onCambiar }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.trenConcreto')}</Text>
      <TextInput
        style={s.campo}
        placeholder={t('nueva.placeholderTren')}
        placeholderTextColor={paleta.textoSecundario}
        value={valor}
        onChangeText={onCambiar}
        autoCapitalize="characters"
      />
      {trenes.length > 0 && !valor.trim() && (
        <>
          <Text style={s.pista}>{t('nueva.proximosTrenes')}</Text>
          <View style={s.chips}>
            {trenes.map((t) => (
              <Text
                key={`${t.numeroTren}-${t.salida}`}
                style={[s.chip, valor === t.numeroTren && s.chipActivo]}
                onPress={() => onCambiar(t.numeroTren)}
              >
                {horaGtfs(t.salida)} · {t.numeroTren}
              </Text>
            ))}
          </View>
        </>
      )}
    </>
  );
}
