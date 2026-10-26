import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PaginaLegal } from '@/components/layout/PaginaLegal';
import { useMetaPagina } from '@/hooks/useMetaPagina';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

const FUERTE = { strong: <strong className="text-foreground" /> };

export function PaginaTerminos() {
  useMetaPagina('/terminos');
  const { t } = useTranslation();

  return (
    <PaginaLegal titulo={t('terminos.titulo')} entradilla={t('terminos.entradilla')}>
      <Seccion titulo={t('terminos.s1Titulo')}>
        <p>{t('terminos.s1Texto')}</p>
      </Seccion>

      <Seccion titulo={t('terminos.s2Titulo')}>
        <p>{t('terminos.s2Texto')}</p>
      </Seccion>

      <Seccion titulo={t('terminos.s3Titulo')}>
        <p>
          <Trans i18nKey="terminos.s3Texto" components={FUERTE} />
        </p>
      </Seccion>

      <Seccion titulo={t('terminos.s4Titulo')}>
        <p>{t('terminos.s4Texto')}</p>
      </Seccion>
    </PaginaLegal>
  );
}
