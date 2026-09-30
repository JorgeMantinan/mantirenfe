import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PaginaLegal } from '@/components/layout/PaginaLegal';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

const FUERTE = { strong: <strong className="text-foreground" /> };
const CODIGO = { code: <code className="rounded bg-muted px-1" /> };

export function PaginaCookies() {
  const { t } = useTranslation();

  return (
    <PaginaLegal titulo={t('cookies.titulo')} entradilla={t('cookies.entradilla')}>
      <Seccion titulo={t('cookies.s1Titulo')}>
        <p>{t('cookies.s1Texto')}</p>
      </Seccion>

      <Seccion titulo={t('cookies.s2Titulo')}>
        <p>{t('cookies.s2Intro')}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Trans i18nKey="cookies.liSesion" components={{ ...FUERTE, ...CODIGO }} />
          </li>
          <li>
            <Trans i18nKey="cookies.liTema" components={FUERTE} />
          </li>
          <li>
            <Trans i18nKey="cookies.liPreferencias" components={FUERTE} />
          </li>
          <li>
            <Trans i18nKey="cookies.liCache" components={FUERTE} />
          </li>
          <li>
            <Trans i18nKey="cookies.liAds" components={{ ...FUERTE, em: <em /> }} />
          </li>
          <li>
            <Trans i18nKey="cookies.liAnalitica" components={FUERTE} />
          </li>
        </ul>
      </Seccion>

      <Seccion titulo={t('cookies.s3Titulo')}>
        <p>
          <Trans i18nKey="cookies.s3p1" components={FUERTE} />
        </p>
        <p>{t('cookies.s3p2')}</p>
      </Seccion>

      <Seccion titulo={t('cookies.s4Titulo')}>
        <p>{t('cookies.s4Texto')}</p>
      </Seccion>
    </PaginaLegal>
  );
}
