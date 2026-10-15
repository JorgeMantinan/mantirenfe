import { Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTema } from '@/lib/tema-contexto';

/**
 * «Plazas y precio» con el icono del dólar (mismo símbolo que la web): un
 * botón con borde, fácil de tocar, que despliega el panel bajo la fila.
 */
export function BotonPlazas({ onPress, activo }: { onPress: () => void; activo?: boolean }) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('trenes.verPlazas')}
      accessibilityState={{ selected: activo }}
      hitSlop={8}
      style={{
        padding: 8,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: paleta.primario,
        backgroundColor: activo ? paleta.fondoSecundario : 'transparent',
      }}
    >
      <MaterialCommunityIcons name="currency-usd" size={18} color={paleta.primario} />
    </Pressable>
  );
}
