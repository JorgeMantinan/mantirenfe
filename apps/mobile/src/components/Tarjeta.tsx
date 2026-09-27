import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTema } from '@/lib/tema-contexto';
import { espaciado, radio, type Paleta } from '@/lib/tema';

interface TarjetaProps {
  children: ReactNode;
  style?: ViewStyle;
}

export function Tarjeta({ children, style }: TarjetaProps) {
  const { paleta } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);
  return <View style={[s.tarjeta, style]}>{children}</View>;
}

interface EtiquetaProps {
  children: ReactNode;
  tono?: 'exito' | 'aviso' | 'neutro' | 'primario' | 'error';
  style?: ViewStyle;
}

export function Etiqueta({ children, tono = 'neutro', style }: EtiquetaProps) {
  const { paleta, oscuro } = useTema();
  const s = useMemo(() => estilos(paleta), [paleta]);

  const fondos = {
    exito: oscuro ? 'rgba(34, 197, 94, 0.18)' : '#dcfce7',
    aviso: oscuro ? 'rgba(245, 158, 11, 0.18)' : '#fef3c7',
    neutro: paleta.fondoSecundario,
    primario: paleta.acento,
    error: oscuro ? 'rgba(248, 113, 113, 0.18)' : '#fee2e2',
  };
  const textos = {
    exito: oscuro ? '#4ade80' : '#166534',
    aviso: oscuro ? '#fbbf24' : '#92400e',
    neutro: paleta.textoSecundario,
    primario: paleta.primarioOscuro,
    error: oscuro ? '#fca5a5' : '#991b1b',
  };
  return (
    <View style={[s.etiqueta, { backgroundColor: fondos[tono] }, style]}>
      <Text style={[s.etiquetaTexto, { color: textos[tono] }]}>{children}</Text>
    </View>
  );
}

const estilos = (c: Paleta) =>
  StyleSheet.create({
    tarjeta: {
      backgroundColor: c.fondo,
      borderRadius: radio.lg,
      borderWidth: 1,
      borderColor: c.borde,
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
