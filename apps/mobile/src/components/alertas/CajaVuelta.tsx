import { useMemo } from 'react';
import { Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BotonElegirFecha } from '@/components/alertas/SelectorFechaNativa';
import { CajaInterruptor } from '@/components/alertas/CajaInterruptor';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  activo: boolean;
  onAlternar: (valor: boolean) => void;
  fechaVuelta: string;
  onFechaVuelta: (iso: string) => void;
  /** Franja propia de la vuelta: vacía = usar la de la ida. */
  horaDesdeVuelta: string;
  onHoraDesdeVuelta: (hora: string) => void;
  horaHastaVuelta: string;
  onHoraHastaVuelta: (hora: string) => void;
  fechaMin: string;
  onAbrirSelector: () => void;
};

/** Caja «También vuelta»: interruptor, avisos y campos de fecha y franja. */
export function CajaVuelta({
  activo,
  onAlternar,
  fechaVuelta,
  onFechaVuelta,
  horaDesdeVuelta,
  onHoraDesdeVuelta,
  horaHastaVuelta,
  onHoraHastaVuelta,
  fechaMin,
  onAbrirSelector,
}: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);
  return (
    <CajaInterruptor
      titulo={t('nueva.tambienVuelta')}
      activo={activo}
      onToggle={onAlternar}
      pistas={[t('nueva.tambienVueltaDesc'), t('nueva.tambienVueltaRiesgo')]}
    >
      {activo ? (
        <>
          <Text style={s.etiqueta}>{t('nueva.fechaVuelta')}</Text>
          <TextInput
            style={s.campo}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={paleta.textoSecundario}
            keyboardType="numbers-and-punctuation"
            value={fechaVuelta}
            onChangeText={onFechaVuelta}
          />
          <Text style={s.pista}>{t('nueva.minimo', { fecha: fechaMin })}</Text>
          <BotonElegirFecha onPress={onAbrirSelector} />
          <Text style={s.etiqueta}>{t('nueva.horaDesdeVueltaLabel')}</Text>
          <TextInput
            style={s.campo}
            placeholder={t('nueva.desdeHora')}
            placeholderTextColor={paleta.textoSecundario}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            value={horaDesdeVuelta}
            onChangeText={onHoraDesdeVuelta}
          />
          <Text style={s.etiqueta}>{t('nueva.horaHastaVueltaLabel')}</Text>
          <TextInput
            style={s.campo}
            placeholder={t('nueva.hastaHora')}
            placeholderTextColor={paleta.textoSecundario}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            value={horaHastaVuelta}
            onChangeText={onHoraHastaVuelta}
          />
          <Text style={s.pista}>{t('nueva.pistaFranjaVuelta')}</Text>
        </>
      ) : null}
    </CajaInterruptor>
  );
}
