import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

interface BotonProps {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'contorno' | 'fantasma' | 'destructivo';
  disabled?: boolean;
  cargando?: boolean;
  style?: ViewStyle;
}

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  disabled,
  cargando,
  style,
}: BotonProps) {
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const fondo =
    variante === 'primario'
      ? paleta.primario
      : variante === 'destructivo'
        ? paleta.error
        : variante === 'contorno'
          ? 'transparent'
          : 'transparent';
  const textoColor =
    variante === 'primario' || variante === 'destructivo'
      ? '#ffffff'
      : variante === 'contorno'
        ? paleta.primario
        : paleta.textoSecundario;
  const bordeColor = variante === 'contorno' ? paleta.primario : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || cargando}
      style={({ pressed }) => [
        s.boton,
        {
          backgroundColor: fondo,
          borderColor: bordeColor,
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={textoColor} />
      ) : (
        <Text style={[s.texto, { color: textoColor }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    boton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderRadius: radio.md,
      paddingVertical: espaciado.md - 2,
      paddingHorizontal: espaciado.lg,
      minHeight: 48,
    },
    texto: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
