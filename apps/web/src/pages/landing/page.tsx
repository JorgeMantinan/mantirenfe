import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BellRing,
  Clock,
  Heart,
  MapPinned,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BloqueBilletes } from '@/components/BloqueBilletes';
import { TrayectosPopulares } from '@/components/TrayectosPopulares';
import { SelectorIdioma } from '@/components/SelectorIdioma';
import { TRAYECTOS_POPULARES, etiquetaTrayecto, rutaTrayecto } from '@/lib/trayectos';
import { useAuth } from '@/hooks/useAuth';
import { useMetaPagina } from '@/hooks/useMetaPagina';
import { hayAfiliacion, hayDonaciones, urlDonaciones } from '@/lib/monetizacion';
import { i18n, rutaEnIdioma, type Idioma } from '@/i18n';

export function PaginaLanding() {
  useMetaPagina('/');
  const { t } = useTranslation();
  const { user, authConfigurada } = useAuth();
  const lang: Idioma = i18n.language === 'en' ? 'en' : 'es';

  const caracteristicas = [
    {
      icono: BellRing,
      titulo: t('landing.caracteristicas.alertasTitulo'),
      texto: t('landing.caracteristicas.alertasTexto'),
    },
    {
      icono: MapPinned,
      titulo: t('landing.caracteristicas.mapaTitulo'),
      texto: t('landing.caracteristicas.mapaTexto'),
    },
    {
      icono: Clock,
      titulo: t('landing.caracteristicas.cuentaTitulo'),
      texto: t('landing.caracteristicas.cuentaTexto'),
    },
    {
      icono: Users,
      titulo: t('landing.caracteristicas.perfilTitulo'),
      texto: t('landing.caracteristicas.perfilTexto'),
    },
    {
      icono: Sparkles,
      titulo: t('landing.caracteristicas.multiTitulo'),
      texto: t('landing.caracteristicas.multiTexto'),
    },
    {
      icono: ShieldCheck,
      titulo: t('landing.caracteristicas.invitadoTitulo'),
      texto: t('landing.caracteristicas.invitadoTexto'),
    },
  ];

  const pasos = [
    { titulo: t('landing.pasos.unoTitulo'), texto: t('landing.pasos.unoTexto') },
    { titulo: t('landing.pasos.dosTitulo'), texto: t('landing.pasos.dosTexto') },
    { titulo: t('landing.pasos.tresTitulo'), texto: t('landing.pasos.tresTexto') },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="font-heading text-lg font-bold">M</span>
            </div>
            <span className="font-heading text-xl font-semibold tracking-tight">
              Manti<span className="text-primary">Renfe</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#caracteristicas" className="hover:text-foreground">
              {t('landing.navCaracteristicas')}
            </a>
            <a href="#como-funciona" className="hover:text-foreground">
              {t('landing.navComoFunciona')}
            </a>
            <Link to="/mapa" className="hover:text-foreground">
              {t('landing.navMapa')}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <SelectorIdioma />
            {user ? (
              <Button asChild>
                <Link to="/dashboard">
                  {t('landing.botonMiPanel')} <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : authConfigurada ? (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/login">{t('cabecera.entrar')}</Link>
                </Button>
                <Button asChild>
                  <Link to="/registro">{t('landing.botonEmpezar')}</Link>
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link to="/mapa">{t('landing.botonVerMapa')}</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,theme(colors.purple.100),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,theme(colors.purple.950),transparent_55%)]"
          aria-hidden="true"
        />
        <div className="container relative grid gap-12 py-20 md:grid-cols-2 md:py-28">
          <div className="animate-slide-up space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {t('landing.heroBadge')}
            </span>
            <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              {t('landing.heroTituloAntes')}
              <br />
              <span className="text-primary">{t('landing.heroTituloFuerte')}</span>
              {t('landing.heroTituloDespues')}
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">{t('landing.heroTexto')}</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to={user ? '/alertas/nueva' : '/registro'}>
                  {t('landing.heroCtaPrimera')} <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/trenes">{t('landing.heroCtaHorarios')}</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('landing.heroPwa')}</p>
          </div>

          <div className="animate-slide-up-delayed relative">
            <Card className="mx-auto max-w-sm shadow-xl shadow-primary/10">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{t('landing.demoTrayecto')}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    {t('landing.demoPlaza')}
                  </span>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('landing.demoTren')}
                  </p>
                  <p className="font-heading text-2xl font-bold">{t('landing.demoAsientos')}</p>
                  <p className="text-sm text-muted-foreground">{t('landing.demoDetalles')}</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <strong>{t('landing.demoAviso')}</strong> {t('landing.demoAvisoTexto')}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="caracteristicas" className="border-t bg-muted/30 py-20">
        <div className="container space-y-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              {t('landing.caracteristicasTitulo')}
            </h2>
            <p className="mt-3 text-muted-foreground">{t('landing.caracteristicasTexto')}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {caracteristicas.map((feature) => (
              <Card key={feature.titulo} className="transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icono className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="font-heading text-lg font-semibold">{feature.titulo}</h3>
                  <p className="text-sm text-muted-foreground">{feature.texto}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {hayAfiliacion && (
        <section id="billetes" className="border-t bg-muted/30 py-10">
          <div className="container">
            <BloqueBilletes />
          </div>
        </section>
      )}

      <section id="como-funciona" className="py-20">
        <div className="container grid gap-8 md:grid-cols-3">
          {pasos.map((paso) => (
            <div key={paso.titulo} className="space-y-2">
              <h3 className="font-heading text-xl font-semibold text-primary">{paso.titulo}</h3>
              <p className="text-muted-foreground">{paso.texto}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="trayectos" className="border-t bg-muted/30 py-20">
        <div className="container space-y-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              {t('landing.trayectosTitulo')}
            </h2>
            <p className="mt-3 text-muted-foreground">{t('landing.trayectosTexto')}</p>
          </div>
          <TrayectosPopulares cantidad={10} lang={lang} />
          <p className="text-center">
            <Link
              to={rutaEnIdioma('/trayectos', lang)}
              className="font-medium text-primary hover:underline"
            >
              {t('landing.verTodos')}
            </Link>
          </p>
        </div>
      </section>

      {lang === 'es' && (
        <section id="en" className="border-t py-16">
          <div className="container space-y-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                {t('landing.inglesTitulo')}
              </h2>
              <p className="mt-3 text-muted-foreground">{t('landing.inglesTexto')}</p>
            </div>
            <ul className="flex flex-wrap justify-center gap-2">
              {TRAYECTOS_POPULARES.slice(0, 5).map((trayecto) => {
                const ruta = rutaTrayecto(trayecto, 'en');
                return (
                  <li key={ruta}>
                    <Link
                      to={ruta}
                      lang="en"
                      className="inline-block rounded-full border bg-muted/40 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
                    >
                      {etiquetaTrayecto(trayecto, 'en')}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="text-center text-sm">
              <Link
                to="/en/trayectos"
                lang="en"
                className="font-medium text-primary hover:underline"
              >
                {t('landing.inglesEnlace')}
              </Link>
            </p>
          </div>
        </section>
      )}

      <section className="border-t py-16">
        <div className="container flex flex-col items-center gap-6 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight">
            {t('landing.finalTitulo')}
          </h2>
          <Button size="lg" asChild>
            <Link to={user ? '/alertas/nueva' : '/registro'}>
              {t('landing.botonCuentaGratis')} <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t bg-muted/30 py-10">
        <div className="container flex flex-col items-center gap-4 text-center text-sm text-muted-foreground">
          {hayDonaciones && (
            <div className="space-y-1">
              <Button variant="ghost" size="sm" asChild>
                <a href={urlDonaciones} target="_blank" rel="noopener noreferrer">
                  <Heart className="h-4 w-4" aria-hidden="true" /> {t('landing.apoya')}
                </a>
              </Button>
              <p className="text-xs">{t('landing.donaciones')}</p>
            </div>
          )}
          <p>
            <strong>MantiRenfe</strong>
            {t('pie.afiliacion')}
          </p>
          <p>{t('pie.datos')}</p>
          <nav className="flex flex-wrap justify-center gap-4 text-xs">
            <Link to="/incidencias" className="hover:text-foreground">
              {t('comunes.incidencias')}
            </Link>
            <Link to="/suprimidos" className="hover:text-foreground">
              {t('comunes.suprimidos')}
            </Link>
            <Link to="/puntualidad" className="hover:text-foreground">
              {t('comunes.impuntuales')}
            </Link>
            <Link to="/guia" className="hover:text-foreground">
              {t('pie.navGuia')}
            </Link>
            <Link to="/transparencia" className="hover:text-foreground">
              {t('comunes.transparencia')}
            </Link>
            <Link to="/cookies" className="hover:text-foreground">
              {t('comunes.cookies')}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
