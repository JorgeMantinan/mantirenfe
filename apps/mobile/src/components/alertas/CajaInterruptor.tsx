import { type ReactNode, useMemo } from 'react';
import { Switch, Text, View } from 'react-native';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  /** Título con checkbox de la caja («Permitir 1 escala», «También vuelta»…). */
  titulo: string;
  activo: boolean;
  onToggle: (valor: boolean) => void;
  /** Notas de 12 px bajo el interruptor, en orden. */
  pistas: string[];
  /** Desactiva el toque y el interruptor (carga de la edición). */
  deshabilitado?: boolean;
  /** Contenido extra que se pinta bajo las pistas (campos de la vuelta…). */
  children?: ReactNode;
};

/**
 * Caja con interruptor: la usan el control de conexiones y el bloque de vuelta.
 * El estado y el handler viven en la pantalla; aquí solo se pinta.
 */
export function CajaInterruptor({
  titulo,
  activo,
  onToggle,
  pistas,
  deshabilitado,
  children,
}: Props) {
  const { paleta } = useTema();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <View style={s.cajaVuelta}>
      <View style={s.cajaVueltaFila}>
        <Text
          style={s.cajaVueltaTitulo}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: activo, disabled: deshabilitado }}
          onPress={() => {
            if (!deshabilitado) onToggle(!activo);
          }}
        >
          {titulo}
        </Text>
        <Switch
          value={activo}
          disabled={deshabilitado}
          onValueChange={onToggle}
          trackColor={{ true: paleta.primarioClaro, false: paleta.borde }}
          thumbColor="#fff"
        />
      </View>
      {pistas.map((texto, i) => (
        <Text key={i} style={s.pista}>
          {texto}
        </Text>
      ))}
      {children}
    </View>
  );
}
