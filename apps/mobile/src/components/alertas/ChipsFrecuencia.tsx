import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FRECUENCIAS, type Frecuencia } from '@/lib/alertas';
import { estilosNueva } from '@/components/alertas/estilos';
import { useTema } from '@/lib/tema-contexto';

type Props = {
  frecuencia: Frecuencia;
  /** Días marcados para «Días concretos» (preselección: lunes a viernes). */
  dias: number[];
  onFrecuencia: (valor: Frecuencia) => void;
  onAlternarDia: (dia: number) => void;
};

/** «Cuándo»: chips de modalidad y, en «Días concretos», los días de la semana. */
export function ChipsFrecuencia({ frecuencia, dias, onFrecuencia, onAlternarDia }: Props) {
  const { paleta } = useTema();
  const { t } = useTranslation();
  const s = useMemo(() => estilosNueva(paleta), [paleta]);

  const etiquetas: Record<Frecuencia, string> = {
    fecha: t('nueva.frecuencia.fecha'),
    flexible: t('nueva.frecuencia.flexible'),
    diaria: t('nueva.frecuencia.diaria'),
    dias: t('nueva.frecuencia.dias'),
  };

  return (
    <>
      <Text style={s.etiqueta}>{t('nueva.cuando')}</Text>
      <View style={s.chips}>
        {FRECUENCIAS.map((valor) => (
          <Text
            key={valor}
            style={[s.chip, frecuencia === valor && s.chipActivo]}
            onPress={() => onFrecuencia(valor)}
          >
            {etiquetas[valor]}
          </Text>
        ))}
      </View>
      {frecuencia === 'diaria' ? <Text style={s.pista}>{t('nueva.cotidianoDiaria')}</Text> : null}
      {frecuencia === 'flexible' ? <Text style={s.pista}>{t('nueva.pistaFlexible')}</Text> : null}
      {frecuencia === 'dias' ? (
        <>
          <View style={s.chips}>
            {t('comunes.diasIniciales')
              .split(',')
              .map((letra, dia) => (
                <Text
                  key={dia}
                  style={[s.chip, dias.includes(dia) && s.chipActivo]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: dias.includes(dia) }}
                  onPress={() => onAlternarDia(dia)}
                >
                  {letra}
                </Text>
              ))}
          </View>
          <Text style={s.pista}>{t('nueva.pistaDias')}</Text>
        </>
      ) : null}
    </>
  );
}
