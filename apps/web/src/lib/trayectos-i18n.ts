import type { MetaPagina } from './seo';

/**
 * Textos ES/EN de las páginas SEO de trayecto. No es un framework i18n: es un
 * único objeto con las dos variantes, seleccionado por la prop `lang` de la
 * página (la app en general sigue siendo solo español).
 */
export type Idioma = 'es' | 'en';

/** Frase partida para poder resaltar los nombres de estación en negrita. */
export interface TextoConEstaciones {
  antes: string;
  entre: string;
  despues: string;
}

export interface TextosTrayecto {
  /** Prefijo de rutas de trayecto en este idioma ("/trayectos" | "/en/trayectos"). */
  rutaBase: string;
  migasTrayectos: string;
  migasAria: string;
  h1: (origen: string, destino: string) => string;
  subtitulo: (fecha: string) => string;
  sinEstacionTitulo: string;
  sinEstacionDescripcion: (faltantes: string) => string;
  /** Une los nombres de estación que no se han encontrado ("y" / "and"). */
  faltanteUnion: string;
  etiquetaOrigen: string;
  etiquetaDestino: string;
  columnaSalida: string;
  columnaLlegada: string;
  columnaDuracion: string;
  columnaTren: string;
  columnaOperador: string;
  sinResultados: TextoConEstaciones;
  sinDirectos: (origen: string, destino: string) => string;
  transbordoEn: (estacion: string) => string;
  espera: (minutos: number) => string;
  tarjetaTitulo: string;
  tarjetaDescripcion: (
    directas: number,
    conTransbordo: number,
    fuente: string | null,
    limite: number,
  ) => string;
  ctaTitulo: (origen: string, destino: string) => string;
  ctaTexto: string;
  ctaBoton: string;
  datosTitulo: string;
  datosOrigen: (fuente: string | null) => string;
  datosIndependiente: string;
  otrosTitulo: string;
  otrosDescripcion: string;
  errorCarga: string;
}

export interface TextosTrayectos {
  /** Prefijo de rutas de trayecto en este idioma ("/trayectos" | "/en/trayectos"). */
  rutaBase: string;
  h1: string;
  subtitulo: string;
  buscadorTitulo: string;
  buscadorDescripcion: string;
  etiquetaOrigen: string;
  etiquetaDestino: string;
  botonBuscar: string;
  popularesTitulo: string;
  popularesDescripcion: (total: number) => string;
}

export const TEXTOS_TRAYECTO: Record<Idioma, TextosTrayecto> = {
  es: {
    rutaBase: '/trayectos',
    migasTrayectos: 'Trayectos',
    migasAria: 'Migas de pan',
    h1: (origen, destino) => `Horarios de ${origen} a ${destino}`,
    subtitulo: (fecha) =>
      `Programa de ${fecha}: primeras salidas con hora de llegada, duración, número de tren y operador.`,
    sinEstacionTitulo: 'No encontramos esa estación',
    sinEstacionDescripcion: (faltantes) =>
      `No encontramos ninguna estación que encaje con ${faltantes}. Elige la que buscas y te llevamos a su página de horarios.`,
    faltanteUnion: ' y ',
    etiquetaOrigen: 'Origen',
    etiquetaDestino: 'Destino',
    columnaSalida: 'Salida',
    columnaLlegada: 'Llegada',
    columnaDuracion: 'Duración',
    columnaTren: 'Tren',
    columnaOperador: 'Operador',
    sinResultados: {
      antes: 'Sin resultados para hoy: no hay trenes programados de ',
      entre: ' a ',
      despues:
        ' (ni directos ni con transbordo). Prueba con otro día o divide el viaje en dos tramos.',
    },
    sinDirectos: (origen, destino) =>
      `Hoy no hay trenes directos de ${origen} a ${destino}: todas las opciones con transbordo aparecen marcadas.`,
    transbordoEn: (estacion) => `Transbordo en ${estacion}`,
    espera: (minutos) => `espera ${minutos} min`,
    tarjetaTitulo: 'Primeras salidas de hoy',
    tarjetaDescripcion: (directas, conTransbordo, fuente, limite) =>
      `${directas} directas · ${conTransbordo} con transbordo · fuente: ${fuente ?? 'cache'} · primeras ${limite} salidas del día`,
    ctaTitulo: (origen, destino) => `¿Viajas a menudo de ${origen} a ${destino}?`,
    ctaTexto: 'Te avisamos cuando se libere plaza, cambie el horario o el tren vaya con retraso.',
    ctaBoton: 'Crea una alerta para este trayecto',
    datosTitulo: 'Datos',
    datosOrigen: (fuente) =>
      `Origen de los datos: Renfe Operadora (open data)${fuente ? ` · fuente de la respuesta: ${fuente}` : ''}.`,
    datosIndependiente: 'Proyecto independiente, no afiliado ni patrocinado por Renfe.',
    otrosTitulo: 'Otros trayectos populares',
    otrosDescripcion:
      'Horarios de los trayectos más buscados en España, con las primeras salidas del día.',
    errorCarga: 'No se pudieron cargar los horarios',
  },
  en: {
    rutaBase: '/en/trayectos',
    migasTrayectos: 'Routes',
    migasAria: 'Breadcrumb',
    h1: (origen, destino) => `Trains from ${origen} to ${destino}`,
    subtitulo: (fecha) =>
      `Train schedule for ${fecha}: first departures with arrival time, duration, train number and operator.`,
    sinEstacionTitulo: "We couldn't find that station",
    sinEstacionDescripcion: (faltantes) =>
      `No station matches ${faltantes}. Pick the one you are looking for and we will take you to its timetable page.`,
    faltanteUnion: ' and ',
    etiquetaOrigen: 'Origin',
    etiquetaDestino: 'Destination',
    columnaSalida: 'Departure',
    columnaLlegada: 'Arrival',
    columnaDuracion: 'Duration',
    columnaTren: 'Train',
    columnaOperador: 'Operator',
    sinResultados: {
      antes: 'No results for today: there are no scheduled trains from ',
      entre: ' to ',
      despues: ' (direct or with changes). Try another day or split the journey in two legs.',
    },
    sinDirectos: (origen, destino) =>
      `There are no direct trains from ${origen} to ${destino} today: every option with a change is flagged.`,
    transbordoEn: (estacion) => `Change at ${estacion}`,
    espera: (minutos) => `wait ${minutos} min`,
    tarjetaTitulo: 'First departures today',
    tarjetaDescripcion: (directas, conTransbordo, fuente, limite) =>
      `${directas} direct · ${conTransbordo} with changes · source: ${fuente ?? 'cache'} · first ${limite} departures of the day`,
    ctaTitulo: (origen, destino) => `Travelling often from ${origen} to ${destino}?`,
    ctaTexto:
      "We'll let you know when a seat opens up, the timetable changes or the train is running late.",
    ctaBoton: 'Set up an alert for this route',
    datosTitulo: 'Data',
    datosOrigen: (fuente) =>
      `Data source: Renfe Operadora (open data)${fuente ? ` · response source: ${fuente}` : ''}.`,
    datosIndependiente: 'Independent project, not affiliated with Renfe.',
    otrosTitulo: 'Other popular routes',
    otrosDescripcion:
      "Timetables for Spain's most searched routes, with the first departures of the day.",
    errorCarga: 'Could not load the timetables',
  },
};

export const TEXTOS_TRAYECTOS: Record<Idioma, TextosTrayectos> = {
  es: {
    rutaBase: '/trayectos',
    h1: 'Horarios de tren por trayectos',
    subtitulo:
      'Elige origen y destino para ver las primeras salidas del día con duración, número de tren y operador. También puedes empezar por uno de los trayectos más buscados.',
    buscadorTitulo: 'Tu trayecto',
    buscadorDescripcion: 'Consulta sin cuenta. Las alertas de disponibilidad requieren registro.',
    etiquetaOrigen: 'Origen',
    etiquetaDestino: 'Destino',
    botonBuscar: 'Ver horarios',
    popularesTitulo: 'Trayectos populares',
    popularesDescripcion: (total) =>
      `Los ${total} trayectos más buscados de la red, con las primeras salidas de hoy y el detalle de cada tren. Si el tuyo no está, búscalo en el formulario de arriba.`,
  },
  en: {
    rutaBase: '/en/trayectos',
    h1: 'Train schedules by route',
    subtitulo:
      'Choose origin and destination to see today’s first departures with duration, train number and operator. You can also start from one of the most searched routes.',
    buscadorTitulo: 'Your journey',
    buscadorDescripcion: 'Browse without an account. Availability alerts require sign-up.',
    etiquetaOrigen: 'Origin',
    etiquetaDestino: 'Destination',
    botonBuscar: 'See timetables',
    popularesTitulo: 'Popular routes',
    popularesDescripcion: (total) =>
      `The ${total} most searched routes on the network, with today's first departures and the detail of each train. If yours is not there, search for it in the form above.`,
  },
};

/** Meta tags de la página de detalle de un trayecto, con el hreflang del otro idioma. */
export function metaTrayecto(
  lang: Idioma,
  origen: string,
  destino: string,
  ruta: string,
): MetaPagina {
  const anio = new Date().getFullYear();
  if (lang === 'en') {
    return {
      titulo: `Trains from ${origen} to ${destino} – timetable ${anio} | MantiRenfe`,
      descripcion: `Train schedule from ${origen} to ${destino}: first departures, arrival time, duration, train number and operator with open data from Renfe. Set up an alert for this route.`,
      canonical: ruta,
      lang: 'en',
      alternate: { hreflang: 'es', href: ruta.replace(/^\/en(?=\/|$)/, '') },
    };
  }
  return {
    titulo: `Horarios de ${origen} a ${destino} ${anio} | MantiRenfe`,
    descripcion: `Horarios de ${origen} a ${destino} hoy: primeras salidas, llegada, duración, tren y operador con datos abiertos de Renfe. Crea una alerta para este trayecto.`,
    canonical: ruta,
    lang: 'es',
    alternate: { hreflang: 'en', href: `/en${ruta}` },
  };
}

/** Meta tags del listado `/trayectos` (y su gemelo `/en/trayectos`). */
export function metaTrayectos(lang: Idioma): MetaPagina {
  const ruta = lang === 'en' ? '/en/trayectos' : '/trayectos';
  return lang === 'en'
    ? {
        titulo: 'Train schedules for routes in Spain | MantiRenfe',
        descripcion:
          'Search train timetables between two stations: first departures of the day, duration, train and operator with open data from Renfe. Popular routes and custom alerts.',
        canonical: ruta,
        lang: 'en',
        alternate: { hreflang: 'es', href: '/trayectos' },
      }
    : {
        titulo: 'Horarios de tren por trayectos de España | MantiRenfe',
        descripcion:
          'Busca horarios de tren entre dos estaciones: primeras salidas del día, duración, tren y operador con datos abiertos de Renfe. Trayectos populares y alertas personalizadas.',
        canonical: ruta,
        lang: 'es',
        alternate: { hreflang: 'en', href: '/en/trayectos' },
      };
}

/** ¿Es una ruta de trayecto (en español o en inglés)? */
export function esRutaTrayecto(pathname: string): boolean {
  const ruta = pathname.replace(/^\/en(?=\/|$)/, '');
  return ruta === '/trayectos' || ruta.startsWith('/trayectos/');
}

/** Misma ruta en el idioma pedido: "/trayectos/a/b" <-> "/en/trayectos/a/b". */
export function rutaEnIdioma(pathname: string, lang: Idioma): string {
  const sinPrefijo = pathname.replace(/^\/en(?=\/|$)/, '') || '/';
  if (lang === 'es') return sinPrefijo;
  return sinPrefijo === '/' ? '/en' : `/en${sinPrefijo}`;
}
