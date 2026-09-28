import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BellRing, Search, TrainFront } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { SeoShell } from '@/components/layout/SeoShell';
import { TrayectosPopulares } from '@/components/TrayectosPopulares';
import { AnuncioAdsense } from '@/components/AnuncioAdsense';
import { aplicarMetaPagina } from '@/lib/seo';
import {
  TRAYECTOS_POPULARES,
  fechaHoy,
  fechaLarga,
  resolverSlug,
  slugATexto,
  textoASlug,
} from '@/lib/trayectos';
import {
  TEXTOS_TRAYECTO,
  TEXTOS_TRAYECTOS,
  metaTrayecto,
  metaTrayectos,
  type Idioma,
  type TextoConEstaciones,
} from '@/lib/trayectos-i18n';
import {
  horaGtfs,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

const MAX_SALIDAS = 10;

/** Frase con los nombres de estación en negrita. */
function conEstaciones(texto: TextoConEstaciones, origen: string, destino: string) {
  return (
    <>
      {texto.antes}
      <strong>{origen}</strong>
      {texto.entre}
      <strong>{destino}</strong>
      {texto.despues}
    </>
  );
}

function BuscadorEstacion({
  id,
  etiqueta,
  onElegir,
  onTexto,
}: {
  id: string;
  etiqueta: string;
  onElegir: (estacion: EstacionResponse) => void;
  /** Al editar el texto se invalida la estación elegida (no queremos enviar la anterior) */
  onTexto?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [sugerencias, setSugerencias] = useState<EstacionResponse[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const peticion = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const sugerir = (valor: string) => {
    setTexto(valor);
    onTexto?.();
    window.clearTimeout(timer.current);
    if (valor.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      const idPeticion = ++peticion.current;
      api<EstacionResponse[]>(`/estaciones?q=${encodeURIComponent(valor.trim())}&limite=8`)
        .then((r) => {
          if (peticion.current === idPeticion) setSugerencias(r);
        })
        .catch(() => {
          if (peticion.current === idPeticion) setSugerencias([]);
        });
    }, 250);
  };

  return (
    <div className="relative space-y-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        value={texto}
        onChange={(e) => sugerir(e.target.value)}
        placeholder="Madrid-Atocha, Vigo, Sevilla..."
        autoComplete="off"
      />
      {sugerencias.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md">
          {sugerencias.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setTexto(e.nombre);
                  setSugerencias([]);
                  onElegir(e);
                }}
              >
                {e.nombre}
                {e.ciudad ? <span className="text-muted-foreground"> · {e.ciudad}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TablaSalidas({
  trenes,
  origen,
  destino,
  lang,
}: {
  trenes: HorarioTrenResponse[];
  origen: string;
  destino: string;
  lang: Idioma;
}) {
  const t = TEXTOS_TRAYECTO[lang];

  if (trenes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <TrainFront className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {conEstaciones(t.sinResultados, origen, destino)}
        </p>
      </div>
    );
  }

  const sinDirectos = trenes.every((x) => x.transbordo);
  const primeras = [...trenes]
    .sort((a, b) => a.salida.localeCompare(b.salida))
    .slice(0, MAX_SALIDAS);

  return (
    <>
      {sinDirectos ? (
        <div className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          {t.sinDirectos(origen, destino)}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t.columnaSalida}</th>
              <th className="py-2 pr-3 font-medium">{t.columnaLlegada}</th>
              <th className="py-2 pr-3 font-medium">{t.columnaDuracion}</th>
              <th className="py-2 pr-3 font-medium">{t.columnaTren}</th>
              <th className="py-2 font-medium">{t.columnaOperador}</th>
            </tr>
          </thead>
          <tbody>
            {primeras.map((x) => (
              <tr
                key={`${x.numeroTren}-${x.salida}`}
                className="border-b last:border-b-0 align-top"
              >
                <td className="py-2 pr-3 font-medium">{horaGtfs(x.salida)}</td>
                <td className="py-2 pr-3">{horaGtfs(x.llegada)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{x.duracionMin} min</td>
                <td className="py-2 pr-3">
                  <Badge variant="outline" className="whitespace-nowrap">
                    {x.numeroTren}
                  </Badge>
                  {x.transbordo && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="border-amber-500 text-amber-700 dark:text-amber-400"
                      >
                        {t.transbordoEn(x.transbordo.estacion)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {t.espera(x.transbordo.esperaMin)}
                      </span>
                    </div>
                  )}
                </td>
                <td className="py-2">
                  {x.operador ?? <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PaginaTrayecto({ lang = 'es' }: { lang?: Idioma }) {
  const { origenSlug = '', destinoSlug = '' } = useParams();
  const navigate = useNavigate();
  const hoy = useMemo(() => fechaHoy(), []);
  const t = TEXTOS_TRAYECTO[lang];
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin-estacion' | 'error'>('cargando');
  const [origenNombre, setOrigenNombre] = useState('');
  const [destinoNombre, setDestinoNombre] = useState('');
  const [faltaOrigen, setFaltaOrigen] = useState(false);
  const [faltaDestino, setFaltaDestino] = useState(false);
  const [trenes, setTrenes] = useState<HorarioTrenResponse[] | null>(null);
  const [fuente, setFuente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nombreOrigen = origenNombre || slugATexto(origenSlug);
  const nombreDestino = destinoNombre || slugATexto(destinoSlug);
  const rutaActual = `${t.rutaBase}/${origenSlug}/${destinoSlug}`;

  useEffect(() => {
    let cancelado = false;
    setEstado('cargando');
    setOrigenNombre('');
    setDestinoNombre('');
    setFaltaOrigen(false);
    setFaltaDestino(false);
    setTrenes(null);
    setFuente(null);
    setError(null);

    const cargar = async () => {
      const [candidatosOrigen, candidatosDestino] = await Promise.all([
        api<EstacionResponse[]>(
          `/estaciones?q=${encodeURIComponent(slugATexto(origenSlug))}&limite=10`,
        ),
        api<EstacionResponse[]>(
          `/estaciones?q=${encodeURIComponent(slugATexto(destinoSlug))}&limite=10`,
        ),
      ]);
      if (cancelado) return;

      const resueltoOrigen = resolverSlug(origenSlug, candidatosOrigen);
      const resueltoDestino = resolverSlug(destinoSlug, candidatosDestino);
      if (!resueltoOrigen || !resueltoDestino) {
        setFaltaOrigen(!resueltoOrigen);
        setFaltaDestino(!resueltoDestino);
        setEstado('sin-estacion');
        return;
      }
      setOrigenNombre(resueltoOrigen);
      setDestinoNombre(resueltoDestino);

      const datos = await api<{ trenes: HorarioTrenResponse[]; fuente: string }>(
        `/trenes/horarios?origen=${encodeURIComponent(resueltoOrigen)}&destino=${encodeURIComponent(resueltoDestino)}&fecha=${hoy}`,
      );
      if (cancelado) return;
      setTrenes(datos.trenes);
      setFuente(datos.fuente);
      setEstado('listo');
    };

    cargar().catch((e: unknown) => {
      if (cancelado) return;
      setError(e instanceof Error ? e.message : TEXTOS_TRAYECTO[lang].errorCarga);
      setEstado('error');
    });

    return () => {
      cancelado = true;
    };
  }, [origenSlug, destinoSlug, hoy, lang]);

  useEffect(
    () => aplicarMetaPagina(metaTrayecto(lang, nombreOrigen, nombreDestino, rutaActual)),
    [lang, nombreOrigen, nombreDestino, rutaActual],
  );

  const directos = trenes?.filter((x) => !x.transbordo).length ?? 0;
  const conTransbordo = (trenes?.length ?? 0) - directos;
  const faltantes = [
    faltaOrigen ? `«${slugATexto(origenSlug)}»` : null,
    faltaDestino ? `«${slugATexto(destinoSlug)}»` : null,
  ]
    .filter((texto): texto is string => texto !== null)
    .join(t.faltanteUnion);

  return (
    <SeoShell lang={lang}>
      <div className="container mx-auto max-w-4xl space-y-6 animate-fade-in">
        <nav className="text-sm text-muted-foreground" aria-label={t.migasAria}>
          <Link to={t.rutaBase} className="hover:text-foreground">
            {t.migasTrayectos}
          </Link>{' '}
          · {nombreOrigen} → {nombreDestino}
        </nav>

        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            {t.h1(nombreOrigen, nombreDestino)}
          </h1>
          <p className="text-muted-foreground">{t.subtitulo(fechaLarga(hoy, lang))}</p>
        </div>

        {estado === 'cargando' ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : estado === 'sin-estacion' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Search className="h-5 w-5 text-primary" aria-hidden="true" />
                {t.sinEstacionTitulo}
              </CardTitle>
              <CardDescription>{t.sinEstacionDescripcion(faltantes)}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {faltaOrigen ? (
                <BuscadorEstacion
                  id="origen"
                  etiqueta={t.etiquetaOrigen}
                  onElegir={(e) => navigate(`${t.rutaBase}/${textoASlug(e.nombre)}/${destinoSlug}`)}
                />
              ) : null}
              {faltaDestino ? (
                <BuscadorEstacion
                  id="destino"
                  etiqueta={t.etiquetaDestino}
                  onElegir={(e) => navigate(`${t.rutaBase}/${origenSlug}/${textoASlug(e.nombre)}`)}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <>
            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                {error}
              </div>
            ) : null}

            {trenes ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t.tarjetaTitulo}</CardTitle>
                  <CardDescription>
                    {t.tarjetaDescripcion(directos, conTransbordo, fuente, MAX_SALIDAS)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TablaSalidas
                    trenes={trenes}
                    origen={nombreOrigen}
                    destino={nombreDestino}
                    lang={lang}
                  />
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="space-y-1">
                  <p className="font-heading text-lg font-semibold">
                    {t.ctaTitulo(nombreOrigen, nombreDestino)}
                  </p>
                  <p className="text-sm text-muted-foreground">{t.ctaTexto}</p>
                </div>
                <Button size="lg" asChild>
                  <Link
                    to={`/alertas/nueva?origen=${encodeURIComponent(nombreOrigen)}&destino=${encodeURIComponent(nombreDestino)}&fecha=${hoy}`}
                  >
                    <BellRing className="h-4 w-4" aria-hidden="true" />
                    {t.ctaBoton}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-semibold">{t.datosTitulo}</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                <li>{t.datosOrigen(fuente)}</li>
                <li>{t.datosIndependiente}</li>
              </ul>
            </div>

            <AnuncioAdsense />

            <section className="space-y-3">
              <h2 className="font-heading text-xl font-semibold">{t.otrosTitulo}</h2>
              <p className="text-sm text-muted-foreground">{t.otrosDescripcion}</p>
              <TrayectosPopulares cantidad={10} rutaActual={rutaActual} lang={lang} />
            </section>
          </>
        )}
      </div>
    </SeoShell>
  );
}

export function PaginaTrayectos({ lang = 'es' }: { lang?: Idioma }) {
  const navigate = useNavigate();
  const t = TEXTOS_TRAYECTOS[lang];
  const [origen, setOrigen] = useState<EstacionResponse | null>(null);
  const [destino, setDestino] = useState<EstacionResponse | null>(null);

  useEffect(() => aplicarMetaPagina(metaTrayectos(lang)), [lang]);

  const buscar = (event: FormEvent) => {
    event.preventDefault();
    if (!origen || !destino) return;
    navigate(`${t.rutaBase}/${textoASlug(origen.nombre)}/${textoASlug(destino.nombre)}`);
  };

  return (
    <SeoShell lang={lang}>
      <div className="container mx-auto max-w-4xl space-y-8 animate-fade-in">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t.h1}</h1>
          <p className="text-muted-foreground">{t.subtitulo}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Search className="h-5 w-5 text-primary" aria-hidden="true" /> {t.buscadorTitulo}
            </CardTitle>
            <CardDescription>{t.buscadorDescripcion}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={buscar} className="grid gap-4 sm:grid-cols-3">
              <BuscadorEstacion
                id="origen"
                etiqueta={t.etiquetaOrigen}
                onElegir={setOrigen}
                onTexto={() => setOrigen(null)}
              />
              <BuscadorEstacion
                id="destino"
                etiqueta={t.etiquetaDestino}
                onElegir={setDestino}
                onTexto={() => setDestino(null)}
              />
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={!origen || !destino}>
                  {t.botonBuscar}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold">{t.popularesTitulo}</h2>
            <p className="text-sm text-muted-foreground">
              {t.popularesDescripcion(TRAYECTOS_POPULARES.length)}
            </p>
          </div>
          <TrayectosPopulares lang={lang} />
        </section>
      </div>
    </SeoShell>
  );
}
