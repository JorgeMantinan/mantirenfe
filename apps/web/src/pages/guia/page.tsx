import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BellRing,
  Database,
  PlusCircle,
  Search,
  TriangleAlert,
  TrainFront,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SeoShell } from '@/components/layout/SeoShell';
import { useMetaPagina } from '@/hooks/useMetaPagina';
import { preguntasFrecuentes } from '@/lib/jsonld';
import { i18n, type Idioma } from '@/i18n';

/**
 * Guía editorial de `/guia`: explica el producto con texto propio (plazas,
 * retrasos, supresiones, fuentes de datos) y las preguntas frecuentes, que
 * también se serializan como `FAQPage` en el JSON-LD (`lib/metas.ts`).
 */
export function PaginaGuia() {
  useMetaPagina('/guia');
  const { t } = useTranslation();
  const lang: Idioma = i18n.language === 'en' ? 'en' : 'es';

  const secciones = [
    { id: 'que-vigila', icono: BellRing, titulo: t('guia.s1Titulo'), texto: t('guia.s1Texto') },
    { id: 'plazas', icono: PlusCircle, titulo: t('guia.s2Titulo'), texto: t('guia.s2Texto') },
    { id: 'retrasos', icono: TriangleAlert, titulo: t('guia.s3Titulo'), texto: t('guia.s3Texto') },
    { id: 'alertas', icono: TrainFront, titulo: t('guia.s4Titulo'), texto: t('guia.s4Texto') },
    { id: 'datos', icono: Database, titulo: t('guia.s5Titulo'), texto: t('guia.s5Texto') },
  ];
  const faq = preguntasFrecuentes(lang);

  return (
    <SeoShell lang={lang}>
      <article className="container max-w-3xl space-y-10 animate-fade-in">
        <header className="space-y-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            {t('guia.h1')}
          </h1>
          <p className="text-lg text-muted-foreground">{t('guia.entradilla')}</p>
        </header>

        <div className="space-y-8">
          {secciones.map((seccion) => (
            <section key={seccion.id} aria-labelledby={seccion.id} className="space-y-2">
              <h2
                id={seccion.id}
                className="font-heading flex items-center gap-2 text-2xl font-semibold tracking-tight"
              >
                <seccion.icono className="h-6 w-6 text-primary" aria-hidden="true" />
                {seccion.titulo}
              </h2>
              <p className="text-muted-foreground">{seccion.texto}</p>
            </section>
          ))}
        </div>

        <section aria-labelledby="faq" className="space-y-4">
          <h2 id="faq" className="font-heading text-2xl font-semibold tracking-tight">
            {t('guia.faqTitulo')}
          </h2>
          <div className="divide-y rounded-lg border">
            {faq.map(({ pregunta, respuesta }) => (
              <details key={pregunta} className="group p-4">
                <summary className="cursor-pointer list-none font-medium marker:hidden">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block text-primary transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                  {pregunta}
                </summary>
                <p className="mt-2 pl-6 text-muted-foreground">{respuesta}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-heading text-xl font-semibold">{t('guia.ctaTitulo')}</h2>
          <p className="text-sm text-muted-foreground">{t('guia.ctaTexto')}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/alertas/nueva">
                <BellRing className="h-4 w-4" aria-hidden="true" /> {t('guia.ctaBoton')}{' '}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/trayectos">
                <Search className="h-4 w-4" aria-hidden="true" /> {t('pie.navHorarios')}
              </Link>
            </Button>
          </div>
        </section>
      </article>
    </SeoShell>
  );
}
