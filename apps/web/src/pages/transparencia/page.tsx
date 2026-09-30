import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PaginaLegal } from '@/components/layout/PaginaLegal';
import { enlaces, hayAfiliacion, hayDonaciones } from '@/lib/monetizacion';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

const FUERTE = { strong: <strong className="text-foreground" /> };

export function PaginaTransparencia() {
  const { t } = useTranslation();

  return (
    <PaginaLegal titulo={t('comunes.transparencia')} entradilla={t('transparencia.entradilla')}>
      <Seccion titulo={t('transparencia.quienesTitulo')}>
        <p>
          <Trans i18nKey="transparencia.quienes1" components={FUERTE} />
        </p>
        <p>
          <Trans i18nKey="transparencia.quienes2" components={FUERTE} />
        </p>
      </Seccion>

      <Seccion titulo={t('transparencia.financiaTitulo')}>
        <p>{t('transparencia.financiaIntro')}</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <Trans
              i18nKey="transparencia.financiaAfiliacion"
              components={{ ...FUERTE, em: <em /> }}
            />
          </li>
          <li>
            <Trans i18nKey="transparencia.financiaDonaciones" components={FUERTE} />
          </li>
        </ul>
        <p>{t('transparencia.estadoTitulo')}</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {hayAfiliacion
              ? t('transparencia.afiliacionActiva', {
                  nombres: enlaces.map((e) => e.nombre).join(', '),
                })
              : t('transparencia.afiliacionSin')}
          </li>
          <li>
            {hayDonaciones
              ? t('transparencia.donacionesAbierta')
              : t('transparencia.donacionesCerrada')}
          </li>
          <li>{t('transparencia.sinPublicidad')}</li>
        </ul>
      </Seccion>

      <Seccion titulo={t('transparencia.fuentesTitulo')}>
        <p>
          <Trans i18nKey="transparencia.fuentes1" components={FUERTE} />
        </p>
        <p>{t('transparencia.fuentes2')}</p>
        <p>{t('transparencia.fuentes3')}</p>
      </Seccion>
    </PaginaLegal>
  );
}
