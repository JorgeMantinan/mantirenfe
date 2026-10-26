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

export function PaginaPrivacidad() {
  useMetaPagina('/privacidad');
  const { t } = useTranslation();

  return (
    <PaginaLegal titulo={t('privacidad.titulo')} entradilla={t('privacidad.entradilla')}>
      <Seccion titulo={t('privacidad.s1Titulo')}>
        <p>{t('privacidad.s1Texto')}</p>
      </Seccion>

      <Seccion titulo={t('privacidad.s2Titulo')}>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Trans i18nKey="privacidad.liCuenta" components={FUERTE} />
          </li>
          <li>
            <Trans i18nKey="privacidad.liAlertas" components={FUERTE} />
          </li>
          <li>
            <Trans i18nKey="privacidad.liTecnico" components={FUERTE} />
          </li>
          <li>
            <Trans i18nKey="privacidad.liEmail" components={FUERTE} />
          </li>
        </ul>
      </Seccion>

      <Seccion titulo={t('privacidad.s3Titulo')}>
        <p>{t('privacidad.s3Texto')}</p>
      </Seccion>

      <Seccion titulo={t('privacidad.s4Titulo')}>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Trans i18nKey="privacidad.liTerceros" components={FUERTE} />
          </li>
          <li>
            <Trans i18nKey="privacidad.liRenfe" components={FUERTE} />
          </li>
        </ul>
      </Seccion>

      <Seccion titulo={t('privacidad.s5Titulo')}>
        <p>{t('privacidad.s5Texto')}</p>
      </Seccion>
    </PaginaLegal>
  );
}
