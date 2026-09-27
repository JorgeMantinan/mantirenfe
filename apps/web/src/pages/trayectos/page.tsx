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
  horaGtfs,
  type EstacionResponse,
  type HorarioTrenResponse,
} from '@mantirenfe/shared-types';

const MAX_SALIDAS = 10;

function metaTrayecto(origen: string, destino: string, ruta: string) {
  return {
    titulo: `Horarios de ${origen} a ${destino} ${new Date().getFullYear()} | MantiRenfe`,
    descripcion: `Horarios de ${origen} a ${destino} hoy: primeras salidas, llegada, duración, tren y operador con datos abiertos de Renfe. Crea una alerta para este trayecto.`,
    canonical: ruta,
  };
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
}: {
  trenes: HorarioTrenResponse[];
  origen: string;
  destino: string;
}) {
  if (trenes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <TrainFront className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Sin resultados para hoy: no hay trenes programados de <strong>{origen}</strong> a{' '}
          <strong>{destino}</strong> (ni directos ni con transbordo). Prueba con otro día o divide
          el viaje en dos tramos.
        </p>
      </div>
    );
  }

  const sinDirectos = trenes.every((t) => t.transbordo);
  const primeras = [...trenes]
    .sort((a, b) => a.salida.localeCompare(b.salida))
    .slice(0, MAX_SALIDAS);

  return (
    <>
      {sinDirectos ? (
        <div className="mb-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          Hoy no hay trenes directos de {origen} a {destino}: todas las opciones con transbordo
          aparecen marcadas.
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Salida</th>
              <th className="py-2 pr-3 font-medium">Llegada</th>
              <th className="py-2 pr-3 font-medium">Duración</th>
              <th className="py-2 pr-3 font-medium">Tren</th>
              <th className="py-2 font-medium">Operador</th>
            </tr>
          </thead>
          <tbody>
            {primeras.map((t) => (
              <tr
                key={`${t.numeroTren}-${t.salida}`}
                className="border-b last:border-b-0 align-top"
              >
                <td className="py-2 pr-3 font-medium">{horaGtfs(t.salida)}</td>
                <td className="py-2 pr-3">{horaGtfs(t.llegada)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{t.duracionMin} min</td>
                <td className="py-2 pr-3">
                  <Badge variant="outline" className="whitespace-nowrap">
                    {t.numeroTren}
                  </Badge>
                  {t.transbordo && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="border-amber-500 text-amber-700 dark:text-amber-400"
                      >
                        Transbordo en {t.transbordo.estacion}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        espera {t.transbordo.esperaMin} min
                      </span>
                    </div>
                  )}
                </td>
                <td className="py-2">
                  {t.operador ?? <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function PaginaTrayecto() {
  const { origenSlug = '', destinoSlug = '' } = useParams();
  const navigate = useNavigate();
  const hoy = useMemo(() => fechaHoy(), []);
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
  const rutaActual = `/trayectos/${origenSlug}/${destinoSlug}`;

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
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los horarios');
      setEstado('error');
    });

    return () => {
      cancelado = true;
    };
  }, [origenSlug, destinoSlug, hoy]);

  useEffect(
    () => aplicarMetaPagina(metaTrayecto(nombreOrigen, nombreDestino, rutaActual)),
    [nombreOrigen, nombreDestino, rutaActual],
  );

  const directos = trenes?.filter((t) => !t.transbordo).length ?? 0;
  const conTransbordo = (trenes?.length ?? 0) - directos;
  const faltantes = [
    faltaOrigen ? `«${slugATexto(origenSlug)}»` : null,
    faltaDestino ? `«${slugATexto(destinoSlug)}»` : null,
  ]
    .filter((texto): texto is string => texto !== null)
    .join(' y ');

  return (
    <SeoShell>
      <div className="container mx-auto max-w-4xl space-y-6 animate-fade-in">
        <nav className="text-sm text-muted-foreground" aria-label="Migas de pan">
          <Link to="/trayectos" className="hover:text-foreground">
            Trayectos
          </Link>{' '}
          · {nombreOrigen} → {nombreDestino}
        </nav>

        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Horarios de {nombreOrigen} a {nombreDestino}
          </h1>
          <p className="text-muted-foreground">
            Programa de {fechaLarga(hoy)}: primeras salidas con hora de llegada, duración, número de
            tren y operador.
          </p>
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
                No encontramos esa estación
              </CardTitle>
              <CardDescription>
                No encontramos ninguna estación que encaje con {faltantes}. Elige la que buscas y te
                llevamos a su página de horarios.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {faltaOrigen ? (
                <BuscadorEstacion
                  id="origen"
                  etiqueta="Origen"
                  onElegir={(e) => navigate(`/trayectos/${textoASlug(e.nombre)}/${destinoSlug}`)}
                />
              ) : null}
              {faltaDestino ? (
                <BuscadorEstacion
                  id="destino"
                  etiqueta="Destino"
                  onElegir={(e) => navigate(`/trayectos/${origenSlug}/${textoASlug(e.nombre)}`)}
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
                  <CardTitle className="text-lg">Primeras salidas de hoy</CardTitle>
                  <CardDescription>
                    {directos} directas · {conTransbordo} con transbordo · fuente:{' '}
                    {fuente ?? 'cache'} · primeras {MAX_SALIDAS} salidas del día
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TablaSalidas trenes={trenes} origen={nombreOrigen} destino={nombreDestino} />
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
                <div className="space-y-1">
                  <p className="font-heading text-lg font-semibold">
                    ¿Viajas a menudo de {nombreOrigen} a {nombreDestino}?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Te avisamos cuando se libere plaza, cambie el horario o el tren vaya con
                    retraso.
                  </p>
                </div>
                <Button size="lg" asChild>
                  <Link
                    to={`/alertas/nueva?origen=${encodeURIComponent(nombreOrigen)}&destino=${encodeURIComponent(nombreDestino)}&fecha=${hoy}`}
                  >
                    <BellRing className="h-4 w-4" aria-hidden="true" />
                    Crea una alerta para este trayecto
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-semibold">Datos</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                <li>
                  Origen de los datos: Renfe Operadora (open data)
                  {fuente ? ` · fuente de la respuesta: ${fuente}` : ''}.
                </li>
                <li>Proyecto independiente, no afiliado ni patrocinado por Renfe.</li>
              </ul>
            </div>

            <section className="space-y-3">
              <h2 className="font-heading text-xl font-semibold">Otros trayectos populares</h2>
              <p className="text-sm text-muted-foreground">
                Horarios de los trayectos más buscados en España, con las primeras salidas del día.
              </p>
              <TrayectosPopulares cantidad={10} rutaActual={rutaActual} />
            </section>
          </>
        )}
      </div>
    </SeoShell>
  );
}

export function PaginaTrayectos() {
  const navigate = useNavigate();
  const [origen, setOrigen] = useState<EstacionResponse | null>(null);
  const [destino, setDestino] = useState<EstacionResponse | null>(null);

  useEffect(
    () =>
      aplicarMetaPagina({
        titulo: `Horarios de tren por trayectos de España | MantiRenfe`,
        descripcion: `Busca horarios de tren entre dos estaciones: primeras salidas del día, duración, tren y operador con datos abiertos de Renfe. Trayectos populares y alertas personalizadas.`,
        canonical: '/trayectos',
      }),
    [],
  );

  const buscar = (event: FormEvent) => {
    event.preventDefault();
    if (!origen || !destino) return;
    navigate(`/trayectos/${textoASlug(origen.nombre)}/${textoASlug(destino.nombre)}`);
  };

  return (
    <SeoShell>
      <div className="container mx-auto max-w-4xl space-y-8 animate-fade-in">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Horarios de tren por trayectos
          </h1>
          <p className="text-muted-foreground">
            Elige origen y destino para ver las primeras salidas del día con duración, número de
            tren y operador. También puedes empezar por uno de los trayectos más buscados.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Search className="h-5 w-5 text-primary" aria-hidden="true" /> Tu trayecto
            </CardTitle>
            <CardDescription>
              Consulta sin cuenta. Las alertas de disponibilidad requieren registro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={buscar} className="grid gap-4 sm:grid-cols-3">
              <BuscadorEstacion
                id="origen"
                etiqueta="Origen"
                onElegir={setOrigen}
                onTexto={() => setOrigen(null)}
              />
              <BuscadorEstacion
                id="destino"
                etiqueta="Destino"
                onElegir={setDestino}
                onTexto={() => setDestino(null)}
              />
              <div className="flex items-end">
                <Button type="submit" className="w-full" disabled={!origen || !destino}>
                  Ver horarios
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold">Trayectos populares</h2>
            <p className="text-sm text-muted-foreground">
              Los {TRAYECTOS_POPULARES.length} trayectos más buscados de la red, con las primeras
              salidas de hoy y el detalle de cada tren. Si el tuyo no está, búscalo en el formulario
              de arriba.
            </p>
          </div>
          <TrayectosPopulares />
        </section>
      </div>
    </SeoShell>
  );
}
