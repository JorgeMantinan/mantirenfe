import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { haySelectorHora, SelectorHoraNativa } from '@/components/alertas/SelectorHoraNativa';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  valor: string;
  onValor: (hora: string) => void;
  placeholder: string;
  /** true = media fila (la franja ida tiene dos campos en paralelo). */
  flexible?: boolean;
};

/**
 * Campo de hora «HH:MM» con un icono de reloj dentro: al tocarlo se abre el
 * selector NATIVO de hora. Si la build no lo lleva compilado, no se pinta el
 * reloj y el campo sigue funcionando escribiendo a mano (como hasta ahora).
 */
export function CampoHora({ valor, onValor, placeholder, flexible = false }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  const [abierto, setAbierto] = useState(false);

  return (
    <View style={flexible ? { flex: 1 } : undefined}>
      <View>
        <TextInput
          style={[s.campo, { paddingRight: 42 }]}
          placeholder={placeholder}
          placeholderTextColor={paleta.textoSecundario}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          value={valor}
          onChangeText={onValor}
        />
        {haySelectorHora() ? (
          <Pressable
            onPress={() => setAbierto(true)}
            hitSlop={8}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              paddingHorizontal: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('nueva.elegirHora')}
          >
            <Ionicons name="time-outline" size={18} color={paleta.primario} />
          </Pressable>
        ) : null}
      </View>
      {abierto ? (
        <SelectorHoraNativa
          valor={valor}
          onCerrar={() => setAbierto(false)}
          onElegir={(hora) => {
            onValor(hora);
            setAbierto(false);
          }}
        />
      ) : null}
    </View>
  );
}
