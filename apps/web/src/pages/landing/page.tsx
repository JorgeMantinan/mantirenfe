import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { TRAYECTOS_POPULARES, etiquetaTrayecto, rutaTrayecto } from '@/lib/trayectos';
import { useAuth } from '@/hooks/useAuth';
import { hayAfiliacion, hayDonaciones, urlDonaciones } from '@/lib/monetizacion';

const CARACTERISTICAS = [
  {
    icono: BellRing,
    titulo: 'Alertas de disponibilidad',
    texto:
      'Compraste el de las 19:00 y aparece plaza en el de las 17:00. Te avisamos en cuanto cambie.',
  },
  {
    icono: MapPinned,
    titulo: 'Mapa en tiempo real',
    texto: 'Sigue la posición de los trenes de Cercanías y Larga Distancia sobre el mapa.',
  },
  {
    icono: Clock,
    titulo: 'Cuenta atrás a tu salida',
    texto: '«Te faltan 50 minutos»: recordatorios personalizables antes de que salga tu tren.',
  },
  {
    icono: Users,
    titulo: 'Avisos según tu perfil',
    texto:
      'Bono, joven, estudiante, discapacidad, familia numerosa… filtramos lo que te afecta a ti.',
  },
  {
    icono: Sparkles,
    titulo: 'Multioperador',
    texto: 'Renfe, Avlo, Ouigo e Iryo en un solo sitio, sin saltar entre webs.',
  },
  {
    icono: ShieldCheck,
    titulo: 'Modo invitado',
    texto: 'Busca horarios y consulta el mapa sin cuenta. Las alertas requieren login.',
  },
];

const PASOS = [
  {
    titulo: '1. Cuéntanos tu viaje',
    texto: 'Origen, destino, fecha y franja horaria. Tu bono y tipo de tren.',
  },
  {
    titulo: '2. Vigilamos por ti',
    texto: 'Nuestro worker sondea la disponibilidad cada pocos minutos con backoff y reintentos.',
  },
  {
    titulo: '3. Recibe el aviso',
    texto: 'Notificación push al móvil o al navegador en el momento en que hay plaza.',
  },
];

export function PaginaLanding() {
  const { user, authConfigurada } = useAuth();

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
              Características
            </a>
            <a href="#como-funciona" className="hover:text-foreground">
              Cómo funciona
            </a>
            <Link to="/mapa" className="hover:text-foreground">
              Mapa
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">
                  Mi panel <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : authConfigurada ? (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/login">Entrar</Link>
                </Button>
                <Button asChild>
                  <Link to="/registro">Empezar gratis</Link>
                </Button>
              </>
            ) : (
              <Button asChild>
                <Link to="/mapa">Ver el mapa</Link>
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
              Alertas inteligentes para viajeros
            </span>
            <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              No pierdas tu asiento.
              <br />
              <span className="text-primary">Vigilamos los trenes</span> por ti.
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              ¿Compraste el de las 19:00 porque el de las 17:00 estaba completo? MantiRenfe te avisa
              en cuanto se libere una plaza para que cambies de billete a tiempo. Además: mapa en
              tiempo real, cuenta atrás a tu salida y avisos según tu bono.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to={user ? '/alertas/nueva' : '/registro'}>
                  Crear mi primera alerta <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/trenes">Buscar horarios</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Instalable como app en Android e iPhone (PWA). Sin instalar nada extra.
            </p>
          </div>

          <div className="animate-slide-up-delayed relative">
            <Card className="mx-auto max-w-sm shadow-xl shadow-primary/10">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Madrid-Atocha → Sevilla</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    Plaza libre
                  </span>
                </div>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tren de las 17:00
                  </p>
                  <p className="font-heading text-2xl font-bold">0 asientos → 1 libre</p>
                  <p className="text-sm text-muted-foreground">AVLO 02174 · Turista</p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <strong>Aviso enviado</strong> a las 13:20 — cancela tu billete de las 19:00.
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
              Todo lo que necesitas antes de subirte al tren
            </h2>
            <p className="mt-3 text-muted-foreground">
              Hecho para quien compra y cancela billetes, comparte trayecto y quiere llegar justo a
              la hora.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CARACTERISTICAS.map((feature) => (
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
          {PASOS.map((paso) => (
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
            <h2 className="font-heading text-3xl font-bold tracking-tight">Trayectos populares</h2>
            <p className="mt-3 text-muted-foreground">
              Mira las primeras salidas de hoy de los trayectos más buscados de España, con
              duración, número de tren y operador de cada servicio. En cada página encuentras la
              tabla del día y un botón para crear una alerta sobre ese trayecto.
            </p>
          </div>
          <TrayectosPopulares cantidad={10} />
          <p className="text-center">
            <Link to="/trayectos" className="font-medium text-primary hover:underline">
              Ver todos los trayectos →
            </Link>
          </p>
        </div>
      </section>

      <section id="en" className="border-t py-16">
        <div className="container space-y-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Trains in English / For visitors
            </h2>
            <p className="mt-3 text-muted-foreground">
              Visiting Spain and prefer English? These route timetables are published in English
              with the same data: first departures, arrival time, duration, train number and
              operator.
            </p>
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
            <Link to="/en/trayectos" lang="en" className="font-medium text-primary hover:underline">
              All train schedules in English →
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t py-16">
        <div className="container flex flex-col items-center gap-6 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight">
            ¿Listo para no perder tu tren?
          </h2>
          <Button size="lg" asChild>
            <Link to={user ? '/alertas/nueva' : '/registro'}>
              Crear cuenta gratis <ArrowRight aria-hidden="true" />
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
                  <Heart className="h-4 w-4" aria-hidden="true" /> Apoya el proyecto
                </a>
              </Button>
              <p className="text-xs">Las donaciones sostienen el proyecto independiente.</p>
            </div>
          )}
          <p>
            <strong>MantiRenfe</strong> es un proyecto independiente y no está afiliado, patrocinado
            ni respaldado por Renfe Operadora, Adif ni ningún operador ferroviario.
          </p>
          <p>Origen de los datos: Renfe Operadora (open data, CC-BY 4.0) · © 2026 MantiRenfe</p>
          <nav className="flex flex-wrap justify-center gap-4 text-xs">
            <Link to="/incidencias" className="hover:text-foreground">
              Incidencias
            </Link>
            <Link to="/suprimidos" className="hover:text-foreground">
              Suprimidos
            </Link>
            <Link to="/puntualidad" className="hover:text-foreground">
              Trenes impuntuales
            </Link>
            <Link to="/transparencia" className="hover:text-foreground">
              Transparencia
            </Link>
            <Link to="/cookies" className="hover:text-foreground">
              Cookies
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
