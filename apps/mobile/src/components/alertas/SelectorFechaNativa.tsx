import { type ComponentType } from 'react';
import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTema } from '@/lib/tema-contexto';

type PropsSelectorFecha = {
  value: Date;
  mode?: 'date';
  display?: 'default' | 'spinner' | 'calendar';
  minimumDate?: Date;
  onChange: (evento: { type: string }, fecha?: Date) => void;
};

// El selector de fechas es un componente NATIVO: en APKs que aún no lo llevan
// compilado (updates OTA antiguos) el require lanza, lo capturamos y el campo
// sigue funcionando escribiendo a mano.
let SelectorFecha: ComponentType<PropsSelectorFecha> | null = null;
try {
  SelectorFecha = require('@react-native-community/datetimepicker').default;
} catch {
  SelectorFecha = null;
}

/** ISO con los datos LOCALES (toISOString pasaría a UTC y podría restar un día). */
function aIsoLocal(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function fechaMedia(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d, 12) : new Date();
}

/**
 * Enlace «Elegir fecha» bajo cada campo: no se pinta si el picker nativo no
 * está compilado en esta build (entra en vigor escribir la fecha a mano).
 */
export function BotonElegirFecha({ onPress }: { onPress: () => void }) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  if (!SelectorFecha) return null;
  return (
    <Pressable onPress={onPress} style={{ alignSelf: 'flex-start' }} accessibilityRole="button">
      <Text style={{ color: paleta.primario, fontWeight: '600' }}>{t('nueva.elegirFecha')}</Text>
    </Pressable>
  );
}

type PropsFechaNativa = {
  /** Campo que abrió el calendario (null = cerrado: no se monta). */
  campo: 'ida' | 'vuelta' | null;
  /** ISO del campo abierto (fecha de la ida o de la vuelta). */
  valor: string;
  /** Fecha mínima admisible, en ISO. */
  minimo: string;
  onCerrar: () => void;
  /** ISO elegido en el calendario (ya convertido a datos locales). */
  onElegir: (iso: string) => void;
};

/** Calendario nativo: solo se monta si el módulo existe y hay campo abierto. */
export function SelectorFechaNativa({
  campo,
  valor,
  minimo,
  onCerrar,
  onElegir,
}: PropsFechaNativa) {
  if (!SelectorFecha || !campo) return null;
  return (
    <SelectorFecha
      value={fechaMedia(valor)}
      mode="date"
      display="default"
      minimumDate={fechaMedia(minimo)}
      onChange={(evento, d) => {
        onCerrar();
        if (evento.type === 'set' && d) onElegir(aIsoLocal(d));
      }}
    />
  );
}
