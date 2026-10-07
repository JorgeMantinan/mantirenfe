import { useMemo } from 'react';
import { Text, TextInput } from 'react-native';
import type { EstacionResponse } from '@mantirenfe/shared-types';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  etiqueta: string;
  placeholder: string;
  valor: string;
  sugerencias: EstacionResponse[];
  /** Al escribir: la pantalla actualiza el campo y dispara la búsqueda. */
  onCambiar: (texto: string) => void;
  /** Al tocar una sugerencia: rellena el campo y cierra la lista. */
  onElegir: (nombre: string) => void;
};

/** Campo Origen/Destino con su lista de sugerencias de estación debajo. */
export function CampoEstacion({
  etiqueta,
  placeholder,
  valor,
  sugerencias,
  onCambiar,
  onElegir,
}: Props) {
  const { paleta } = useTema();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput
        style={s.campo}
        placeholder={placeholder}
        placeholderTextColor={paleta.textoSecundario}
        value={valor}
        onChangeText={onCambiar}
      />
      {valor.trim().length >= 2 &&
        sugerencias.map((e) => (
          <Text key={e.id} style={s.sugerencia} onPress={() => onElegir(e.nombre)}>
            {e.nombre}
          </Text>
        ))}
    </>
  );
}
