import { type ComponentType } from 'react';

type PropsSelectorHora = {
  value: Date;
  mode?: 'time';
  display?: 'default' | 'spinner' | 'clock';
  is24Hour?: boolean;
  onChange: (evento: { type: string }, fecha?: Date) => void;
};

// Mismo patrón que SelectorFechaNativa: el reloj es un componente NATIVO y en
// APKs que aún no lo llevan compilado (updates OTA antiguos) el require lanza,
// lo capturamos y el campo se pinta sin reloj (la hora se escribe a mano).
let SelectorHora: ComponentType<PropsSelectorHora> | null = null;
try {
  SelectorHora = require('@react-native-community/datetimepicker').default;
} catch {
  SelectorHora = null;
}

/** Si el picker nativo está disponible (decide si se pinta el icono de reloj). */
export function haySelectorHora(): boolean {
  return SelectorHora !== null;
}

/** HH:MM → Date de HOY a esa hora; lo que no valga → ahora mismo. */
function horaMedia(hhmm: string): Date {
  const ahora = new Date();
  const partes = hhmm.split(':');
  const h = Number(partes[0]);
  const m = Number(partes[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return ahora;
  }
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), h, m, 0, 0);
}

/** Date → «HH:MM» en datos locales (nunca UTC: restando una hora a medianoche). */
function aHoraLocal(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Reloj nativo «HH:MM»: solo se monta si el módulo existe. El padre lo pinta
 * con el campo abierto y cierra al elegir o cancelar.
 */
export function SelectorHoraNativa({
  valor,
  onCerrar,
  onElegir,
}: {
  valor: string;
  onCerrar: () => void;
  onElegir: (hhmm: string) => void;
}) {
  if (!SelectorHora) return null;
  return (
    <SelectorHora
      value={horaMedia(valor)}
      mode="time"
      display="default"
      is24Hour
      onChange={(evento, d) => {
        onCerrar();
        if (evento.type === 'set' && d) onElegir(aHoraLocal(d));
      }}
    />
  );
}
