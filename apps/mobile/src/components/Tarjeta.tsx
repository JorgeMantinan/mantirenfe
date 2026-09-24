import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colores, espaciado, radio } from '@/lib/tema';

interface TarjetaProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function Tarjeta({ children, style }: TarjetaProps) {
  return <View style={[estilos.tarjeta, style]}>{children}</View>;
}

interface EtiquetaProps {
  children: ReactNode;
  tono?: 'exito' | 'aviso' | 'neutro' | 'primario';
  style?: ViewStyle;
}

export function Etiqueta({ children, tono = 'neutro', style }: EtiquetaProps) {
  const fondos = {
    exito: '#dcfce7',
    aviso: '#fef3c7',
    neutro: colores.fondoSecundario,
    primario: colores.acento,
  };
  const textos = {
    exito: '#166534',
    aviso: '#92400e',
    neutro: colores.textoSecundario,
    primario: colores.primarioOscuro,
  };
  return (
    <View style={[estilos.etiqueta, { backgroundColor: fondos[tono] }, style]}>
      <Text style={[estilos.etiquetaTexto, { color: textos[tono] }]}>{children}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.fondo,
    borderRadius: radio.lg,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espaciado.md,
    gap: espaciado.sm,
  },
  etiqueta: {
    alignSelf: 'flex-start',
    borderRadius: radio.completo,
    paddingHorizontal: espaciado.sm + 2,
    paddingVertical: 4,
  },
  etiquetaTexto: {
    fontSize: 12,
    fontWeight: '600',
  },
});
