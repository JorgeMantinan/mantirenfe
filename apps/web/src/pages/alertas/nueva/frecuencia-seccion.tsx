import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { frecuencias, letrasDias, type EstadoFormulario, type Frecuencia } from './logica';

interface Props {
  estado: Pick<EstadoFormulario, 'frecuencia' | 'dias'>;
  onFrecuencia: (valor: Frecuencia) => void;
  onAlternarDia: (dia: number, marcado: boolean) => void;
}

/** Bloque "¿Cuándo viajas?": modalidad y, si aplica, los días de la semana. */
export function FrecuenciaSeccion({ estado, onFrecuencia, onAlternarDia }: Props) {
  const { t } = useTranslation();
  const { frecuencia, dias } = estado;
  const flexible = frecuencia === 'flexible';
  // Etiquetas i18n: se recalculan solo cuando cambia el idioma
  const listaFrecuencias = useMemo(() => frecuencias(t), [t]);
  const inicialesDias = useMemo(() => letrasDias(t), [t]);
  return (
    <div className="space-y-2">
      <Label>{t('nuevaAlerta.cuandoViajas')}</Label>
      <div className="flex flex-wrap gap-2">
        {listaFrecuencias.map((f) => (
          <Button
            key={f.valor}
            type="button"
            variant={frecuencia === f.valor ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFrecuencia(f.valor)}
          >
            {f.etiqueta}
          </Button>
        ))}
      </div>
      {frecuencia === 'diaria' && (
        <p className="text-xs text-muted-foreground">{t('nuevaAlerta.recurrenteDiaria')}</p>
      )}
      {flexible && (
        <p className="text-xs text-muted-foreground">{t('nuevaAlerta.pistaFlexible')}</p>
      )}
      {frecuencia === 'dias' && (
        <>
          <p className="text-xs text-muted-foreground">{t('nuevaAlerta.pistaDias')}</p>
          <div className="flex flex-wrap gap-2">
            {inicialesDias.map((letra, dia) => {
              const marcado = dias.includes(dia);
              return (
                <Button
                  key={dia}
                  type="button"
                  variant={marcado ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={marcado}
                  className="h-8 w-8 px-0"
                  onClick={() => onAlternarDia(dia, marcado)}
                >
                  {letra}
                </Button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
