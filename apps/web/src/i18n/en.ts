import type { Claves } from './es';

/**
 * Mismo árbol de claves que `es`, con todas las hojas a `string`: si falta
 * alguna clave (o sobra), TypeScript no deja compilar el diccionario EN.
 */
export type MismoArbol<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : MismoArbol<T[K]>;
};

export const en: MismoArbol<Claves> = {
  // ──────────────────────────────── comunes
  comunes: {
    volverInicio: 'Back to home',
    inicio: 'Home',
    crearAlerta: 'Create alert',
    transparencia: 'Transparency',
    cookies: 'Cookies',
    privacidad: 'Privacy',
    terminos: 'Terms',
    incidencias: 'Service incidents',
    suprimidos: 'Cancelled trains',
    impuntuales: 'Late trains',
    cancelar: 'Cancel',
    eliminar: 'Delete',
    error: 'Error',
    todoElDia: 'all day',
    logoAria: 'MantiRenfe home',
    // Day initials in 0=Sunday … 6=Saturday order (chips and badge)
    diasIniciales: 'S,M,T,W,T,F,S',
    diasCortos: 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
    // Long tables: only the first rows are painted until the button is pressed
    mostrarMas: 'Show more',
  },

  // ──────────────────────────────── ErrorBoundary (render error catcher)
  errorBoundary: {
    titulo: 'Something went wrong',
    texto: 'The page stopped responding. You can reload it to try again.',
    recargar: 'Reload page',
  },

  // ──────────────────────────────── cabecera (Header)
  cabecera: {
    lema: 'Alerts and real-time data for the rail network',
    notificaciones: 'Notifications',
    miPerfil: 'My profile',
    ajustes: 'Settings',
    cerrarSesion: 'Sign out',
    miCuenta: 'My account',
    entrar: 'Sign in',
    registrarse: 'Sign up',
    modoDemo: 'Demo mode (no Supabase)',
    tema: 'Theme',
    cambiarTema: 'Change theme',
    temaClaro: 'Light',
    temaOscuro: 'Dark',
    temaSistema: 'System',
    cambiarIdioma: 'Change language',
  },

  // ──────────────────────────────── selector de idioma
  selectorIdioma: {
    titulo: 'Language',
    es: 'Español',
    en: 'English',
    actual: 'Current language',
  },

  // ──────────────────────────────── menú lateral (Sidebar)
  menu: {
    navegar: 'Main navigation',
    abrir: 'Open menu',
    cerrar: 'Close menu',
    expandir: 'Expand menu',
    contraer: 'Collapse menu',
    grupoPrincipal: 'Main',
    grupoExplorar: 'Explore',
    grupoCuenta: 'Account',
    dashboard: 'Dashboard',
    misAlertas: 'My alerts',
    notificaciones: 'Notifications',
    mapa: 'Live map',
    incidencias: 'Incidents',
    suprimidos: 'Cancelled trains',
    buscarTrenes: 'Search trains',
    estaciones: 'Stations',
    impuntuales: 'Late trains',
    ajustes: 'Settings',
    pie: 'Independent project, not affiliated with or sponsored by Renfe. Data source: Renfe Operadora (open data).',
  },

  // ──────────────────────────────── páginas legales (PaginaLegal)
  legal: {
    copyright: '© 2026 MantiRenfe',
  },

  // ──────────────────────────────── cabecera y pie SEO (SeoShell)
  pie: {
    navTrayectos: 'Routes',
    navHorarios: 'Search timetables',
    navMapa: 'Map',
    navEstaciones: 'Stations',
    cta: 'Create alert',
    afiliacion:
      ' is an independent project, not affiliated with, sponsored or endorsed by Renfe Operadora, Adif or any rail operator.',
    datos: 'Data source: Renfe Operadora (open data, CC-BY 4.0) · © 2026 MantiRenfe',
    ariaIdioma: 'Language',
  },

  // ──────────────────────────────── listado SEO /en/trayectos
  trayectos: {
    rutaBase: '/en/trayectos',
    etiqueta: 'Trains from {{origen}} to {{destino}}',
    h1: 'Train schedules by route',
    subtitulo:
      'Choose origin and destination to see today’s first departures with duration, train number and operator. You can also start from one of the most searched routes.',
    buscadorTitulo: 'Your journey',
    buscadorDescripcion: 'Browse without an account. Availability alerts require sign-up.',
    etiquetaOrigen: 'Origin',
    etiquetaDestino: 'Destination',
    botonBuscar: 'See timetables',
    popularesTitulo: 'Popular routes',
    popularesDescripcion:
      'The {{total}} most searched routes on the network, with today’s first departures and the detail of each train. If yours is not there, search for it in the form above.',
  },

  // ──────────────────────────────── detalle SEO /en/trayectos/:o/:d
  trayecto: {
    rutaBase: '/en/trayectos',
    migasTrayectos: 'Routes',
    migasAria: 'Breadcrumb',
    h1: 'Trains from {{origen}} to {{destino}}',
    subtitulo:
      'Train schedule for {{fecha}}: first departures with arrival time, duration, train number and operator.',
    sinEstacionTitulo: 'We couldn’t find that station',
    sinEstacionDescripcion:
      'No station matches {{faltantes}}. Pick the one you are looking for and we will take you to its timetable page.',
    faltanteUnion: ' and ',
    etiquetaOrigen: 'Origin',
    etiquetaDestino: 'Destination',
    columnaSalida: 'Departure',
    columnaLlegada: 'Arrival',
    columnaDuracion: 'Duration',
    columnaTren: 'Train',
    columnaOperador: 'Operator',
    sinResultadosAntes: 'No results for today: there are no scheduled trains from ',
    sinResultadosEntre: ' to ',
    sinResultadosDespues:
      ' (direct or with changes). Try another day or split the journey in two legs.',
    sinDirectos:
      'There are no direct trains from {{origen}} to {{destino}} today: every option with a change is flagged.',
    transbordoEn: 'Change at {{estacion}}',
    espera: 'wait {{minutos}} min',
    tarjetaTitulo: 'First departures today',
    tarjetaDescripcion:
      '{{directas}} direct · {{conTransbordo}} with changes · source: {{fuente}} · first {{limite}} departures of the day',
    ctaTitulo: 'Travelling often from {{origen}} to {{destino}}?',
    ctaTexto:
      'We’ll let you know when a seat opens up, the timetable changes or the train is running late.',
    ctaBoton: 'Set up an alert for this route',
    datosTitulo: 'Data',
    datosOrigen: 'Data source: Renfe Operadora (open data).',
    datosOrigenFuente: 'Data source: Renfe Operadora (open data) · response source: {{fuente}}.',
    datosIndependiente: 'Independent project, not affiliated with Renfe.',
    otrosTitulo: 'Other popular routes',
    otrosDescripcion:
      'Timetables for Spain’s most searched routes, with the first departures of the day.',
    errorCarga: 'Could not load the timetables',
  },

  // ──────────────────────────────── meta tags SEO
  meta: {
    baseTitulo: 'MantiRenfe - Never lose your seat',
    baseDescripcion:
      'MantiRenfe: availability alerts, timetables and real-time data for the Renfe network',
    trayectoTitulo: 'Trains from {{origen}} to {{destino}} – timetable {{anio}} | MantiRenfe',
    trayectoDescripcion:
      'Train schedule from {{origen}} to {{destino}}: first departures, arrival time, duration, train number and operator with open data from Renfe. Set up an alert for this route.',
    trayectosTitulo: 'Train schedules for routes in Spain | MantiRenfe',
    trayectosDescripcion:
      'Search train timetables between two stations: first departures of the day, duration, train and operator with open data from Renfe. Popular routes and custom alerts.',
  },

  // ──────────────────────────────── formulario / campos comunes
  form: {
    email: 'Email',
    emailPlaceholder: 'you@email.com',
    contrasena: 'Password',
    fecha: 'Date',
  },

  // ──────────────────────────────── cabeceras de tabla reutilizables
  tabla: {
    salida: 'Departure',
    llegada: 'Arrival',
    destino: 'Destination',
    tren: 'Train',
    operador: 'Operator',
    duracion: 'Duration',
  },

  // ──────────────────────────────── estados compartidos de tren/plaza
  estados: {
    cancelado: 'Cancelled',
    hayPlazas: 'Seats available',
    hayPlazasDesde: 'Seats available from {{precio}}',
    completo: 'Full',
    sinDatosPlazas: 'No seat data yet',
    aTiempo: 'On time',
    retraso: 'Delay +{{min}} min',
  },

  // ──────────────────────────────── bloque de billetes (BloqueBilletes)
  billetes: {
    titulo: 'Find your ticket',
    enlace: 'Find your ticket on {{nombre}}',
    aviso: 'Affiliation links: we may earn a commission at no extra cost to you.',
    transparencia: 'How MantiRenfe is funded',
  },

  // ──────────────────────────────── landing
  landing: {
    navCaracteristicas: 'Features',
    navComoFunciona: 'How it works',
    navMapa: 'Map',
    botonMiPanel: 'My dashboard',
    botonEmpezar: 'Get started for free',
    botonVerMapa: 'View the map',
    heroBadge: 'Smart alerts for travellers',
    heroTituloAntes: 'Never lose your seat.',
    heroTituloFuerte: 'We watch the trains',
    heroTituloDespues: ' for you.',
    heroTexto:
      'Bought the 19:00 because the 17:00 was full? MantiRenfe tells you as soon as a seat frees up so you can switch tickets in time. Plus: live map, countdown to your departure and alerts tailored to your railcard.',
    heroCtaPrimera: 'Create my first alert',
    heroCtaHorarios: 'Search timetables',
    heroPwa: 'Installable as an app on Android and iPhone (PWA). Nothing extra to install.',
    demoTrayecto: 'Madrid-Atocha → Sevilla',
    demoPlaza: 'Seat available',
    demoTren: 'The 17:00 train',
    demoAsientos: '0 seats → 1 free',
    demoDetalles: 'AVLO 02174 · Tourist',
    demoAviso: 'Alert sent',
    demoAvisoTexto: 'at 13:20 — cancel your 19:00 ticket.',
    caracteristicasTitulo: 'Everything you need before boarding',
    caracteristicasTexto:
      'Built for people who buy and cancel tickets, share their journey and want to arrive right on time.',
    caracteristicas: {
      alertasTitulo: 'Availability alerts',
      alertasTexto:
        'You booked the 19:00 and a seat opens up on the 17:00. We tell you as soon as it changes.',
      mapaTitulo: 'Live map',
      mapaTexto: 'Follow commuter and long-distance trains on the map in real time.',
      cuentaTitulo: 'Countdown to your departure',
      cuentaTexto: '“50 minutes to go”: customisable reminders before your train leaves.',
      perfilTitulo: 'Alerts for your profile',
      perfilTexto:
        'Railcard, young, student, disability, large family… we only show what applies to you.',
      multiTitulo: 'Multi-operator',
      multiTexto: 'Renfe, Avlo, Ouigo and Iryo in one place, without hopping between websites.',
      invitadoTitulo: 'Guest mode',
      invitadoTexto: 'Search timetables and use the map without an account. Alerts need sign-in.',
    },
    pasos: {
      unoTitulo: '1. Tell us your trip',
      unoTexto: 'Origin, destination, date and time window. Your railcard and train type.',
      dosTitulo: '2. We watch it for you',
      dosTexto: 'Our worker checks availability every few minutes with backoff and retries.',
      tresTitulo: '3. Get the alert',
      tresTexto: 'Push notification to your phone or browser the moment a seat is free.',
    },
    trayectosTitulo: 'Popular routes',
    trayectosTexto:
      'See today’s first departures on Spain’s most searched routes, with duration, train number and operator for each service. Every page shows the day’s timetable and a button to create an alert for that route.',
    verTodos: 'See all routes →',
    inglesTitulo: 'Trains in English / For visitors',
    inglesTexto:
      'Visiting Spain and prefer English? These route timetables are published in English with the same data: first departures, arrival time, duration, train number and operator.',
    inglesEnlace: 'All train schedules in English →',
    finalTitulo: 'Ready to stop missing your train?',
    botonCuentaGratis: 'Create free account',
    apoya: 'Support the project',
    donaciones: 'Donations keep the independent project going.',
  },

  // ──────────────────────────────── acceso (login / registro / reset / callback)
  login: {
    titulo: 'Sign in',
    descripcion: 'Access your alerts and notifications',
    configAntes: 'Set up ',
    configEntre: ' and ',
    configMedio: ' in the file ',
    configDespues:
      '. Create the project in Supabase and enable the Google / Microsoft providers in Authentication → Providers.',
    google: 'Continue with Google',
    microsoft: 'Continue with Outlook / Microsoft',
    oEmail: 'or with email',
    enviando: 'Signing in...',
    entrar: 'Sign in',
    olvidaste: 'Forgot your password?',
    sinCuenta: 'Don’t have an account yet?',
    registrate: 'Sign up',
    errorCampos: 'Enter your email and password',
    bienvenido: 'Welcome back!',
    errorGenerico: 'Could not sign in',
    errorProveedor: 'Provider error',
  },

  registro: {
    titulo: 'Create your account',
    descripcion: 'Custom alerts in under a minute',
    configAntes: 'Set up Supabase in ',
    configDespues: ' to enable sign-ups.',
    google: 'Sign up with Google',
    microsoft: 'Sign up with Outlook',
    nombre: 'Name',
    nombrePlaceholder: 'Alex Traveller',
    repetir: 'Confirm password',
    creando: 'Creating account...',
    crear: 'Create account',
    yaCuenta: 'Already have an account?',
    iniciaSesion: 'Sign in',
    errorCampos: 'Name and email are required',
    errorPassword: 'The password must be at least 8 characters',
    errorIguales: 'Passwords do not match',
    creadaConfirmar: 'Account created. Check your email to confirm access.',
    creada: 'Account created! You are signed in.',
    errorGenerico: 'Could not create the account',
  },

  reset: {
    tituloEnlace: 'Reset password',
    tituloNueva: 'Choose a new password',
    descNueva: 'This will be your new sign-in password',
    descEnlace: 'We will email you a link to create a new one',
    nueva: 'New password',
    guardando: 'Saving...',
    guardar: 'Save password',
    enviando: 'Sending...',
    enviar: 'Send reset link',
    volverLogin: '← Back to sign in',
    noConfig: 'Authentication not configured',
    errorEmail: 'Enter your email',
    enviadoOk: 'If an account exists with that email, we have sent a link to change the password.',
    errorEnvio: 'Could not send',
    okPassword: 'Password updated. You can sign in now.',
    errorActualizar: 'Could not update',
  },

  callback: {
    texto: 'Completing sign-in…',
  },

  noEncontrado: {
    titulo: 'Station not found',
    texto: 'The page you are looking for does not exist or has changed platform.',
  },

  // ──────────────────────────────── página de transparencia
  transparencia: {
    entradilla: 'What MantiRenfe is, where the data comes from and how the project is funded.',
    quienesTitulo: 'Who we are',
    quienes1:
      '<strong>MantiRenfe</strong> is an independent, not-for-profit project run by a person or a small team. We are not affiliated with, sponsored by, endorsed by or managed by Renfe Operadora, Adif, Ouigo, Iryo or any other rail operator.',
    quienes2:
      '<strong>We are not an official Renfe website</strong> and we do not replace venta.renfe.com: we help you track availability, timetables and the state of the network, but tickets are always bought on each operator’s website or app.',
    financiaTitulo: 'How it is funded',
    financiaIntro: 'The project never charges its users. It is funded in these two ways:',
    financiaAfiliacion:
      '<strong>Affiliation links</strong>: when shown, they point to external ticket sellers. If you buy through them, we may earn a commission <em>at no extra cost to you</em>. They do not influence what we show: timetables, prices and alerts come from Renfe’s data, not from whoever pays.',
    financiaDonaciones:
      '<strong>Donations</strong>: voluntary contributions (when the channel is open) to cover servers, domain and maintenance hours. Donations keep the independent project going.',
    estadoTitulo: 'Current state of monetisation:',
    afiliacionActiva: 'Active affiliation links: {{nombres}}.',
    afiliacionSin: 'No active affiliation links for now.',
    donacionesAbierta: 'Donation channel open from the landing page footer.',
    donacionesCerrada: 'No donation channel open for now.',
    sinPublicidad: 'No third-party advertising, no data sales and no sponsorships.',
    fuentesTitulo: 'Data sources',
    fuentes1:
      '<strong>Data source: Renfe Operadora</strong> through its open data programme: static GTFS timetable and station files, plus GTFS-Realtime feeds for positions, delays and incidents, published under the CC-BY 4.0 licence.',
    fuentes2:
      'Our worker syncs those files periodically to keep timetables and positions up to date. Seat availability data comes from Renfe’s ticketing system when it is available.',
    fuentes3:
      'The “Renfe”, “Adif”, “Ouigo” and “Iryo” brands belong to their respective owners and are mentioned for informational purposes only.',
  },

  // ──────────────────────────────── política de cookies
  cookies: {
    titulo: 'Cookie policy',
    entradilla: 'What we store in your browser, why, and how you can control it.',
    s1Titulo: 'What cookies and local storage are',
    s1Texto:
      'Cookies are small files a site stores in your browser. Local storage (localStorage) does the same but is not sent with every request. Both are used to remember things between visits: your session, your theme, your preferences.',
    s2Titulo: 'What this version uses',
    s2Intro: 'We store what the app needs to work:',
    liSesion:
      '<strong>User session</strong>: Supabase Auth stores your session in localStorage (key <code>sb-…-auth-token</code>) so you do not have to sign in on every visit. It is cleared when you sign out.',
    liTema:
      '<strong>Theme</strong>: the light, dark or system preference is stored in localStorage so it is respected the next time you visit.',
    liPreferencias:
      '<strong>Preferences and notifications</strong>: the push subscription and alert settings are linked to your account on our server.',
    liCache:
      '<strong>PWA cache</strong>: the service worker stores the app’s resources in Cache Storage so it opens fast and, where applicable, works offline.',
    liAds:
      '<strong>Advertising (Google AdSense)</strong>: on route pages we show Google AdSense ads. Google and its partners may set cookies and use device identifiers only <em>after</em> your consent (for visitors in the EEA, the UK and Switzerland). That consent is collected by Google’s CMP banner on arrival: <em>Agree · Disagree · Manage options</em>. If you pick <em>Disagree</em>, ads are shown in a non-personalised way.',
    liAnalitica:
      '<strong>We do not use external analytics of our own</strong> (no Google Analytics or similar): only what the app needs, as described in the list above.',
    s3Titulo: 'Consent, advertisers and affiliates',
    s3p1: 'The consent banner (Google’s CMP) appears on your first visit and lets you accept, reject or adjust the purposes at any time from <strong>«Manage options»</strong>, which Google adds to the page itself while the CMP is active. Withdrawing consent takes effect from that same session.',
    s3p2: 'Affiliation links, when present, open third-party websites (Trainline, Omio…) that set their own cookies under their policies, not ours; they are always identified as affiliation links.',
    s4Titulo: 'How to control or delete what is stored',
    s4Texto:
      'You can delete MantiRenfe’s storage from your browser settings (Clear browsing data → Cookies and site data, or stored app data). You can also block cookies and localStorage per site; if you do, the session and remembered theme will stop working until you sign in again.',
  },

  // Privacy policy (required by Google OAuth)
  privacidad: {
    titulo: 'Privacy policy',
    entradilla: 'What personal data we process, why, and what rights you have.',
    s1Titulo: 'Controller and contact',
    s1Texto:
      'Jorge Mantiñán is the controller of the personal data processed by this application. For any inquiry or to exercise your rights, write to jorgemantinanmontero@gmail.com.',
    s2Titulo: 'What data we process',
    liCuenta:
      '<strong>Account</strong>: the email and name you provide when signing up (Supabase Auth).',
    liAlertas:
      '<strong>Alerts and notices</strong>: watched routes, preferences (theme, language, notifications) and the history of notices sent, linked to your account.',
    liTecnico:
      '<strong>Technical data</strong>: push notification tokens of your device and local storage (session, theme, language) in your browser or app.',
    liEmail:
      '<strong>Emails</strong>: if you enable email notices, we use your address solely to send the notices you requested.',
    s3Titulo: 'Purpose and legal basis',
    s3Texto:
      'We process your data to provide the service you requested (train alerts and notices), based on your consent when you sign up and enable notifications. We do not build profiles or use your data for our own advertising purposes.',
    s4Titulo: 'Third parties we work with',
    liTerceros:
      '<strong>Supabase</strong> (authentication and database), <strong>Render</strong> (API and workers), <strong>Vercel</strong> (web), <strong>Expo/Google</strong> (push notifications), <strong>GitHub</strong> (CI) and <strong>Google AdSense</strong> (advertising, only with your consent — see the cookies policy).',
    liRenfe:
      '<strong>Train data</strong> comes from Renfe Operadora as open data (commercial reuse allowed); we are not affiliated with or endorsed by Renfe.',
    s5Titulo: 'Retention and your rights',
    s5Texto:
      'We keep your data while your account is active; you can delete it at any time by closing your account or contacting us. You have the rights of access, rectification, erasure, objection and portability under the GDPR (EU) 2016/679 and Spanish LOPDGDD.',
  },

  // Terms of service (Google OAuth)
  terminos: {
    titulo: 'Terms of service',
    entradilla: 'Basic rules for using MantiRenfe.',
    s1Titulo: 'Use of the service',
    s1Texto:
      'MantiRenfe is an independent personal project: you can create alerts, check timetables and receive notices. We do not guarantee continuous availability or accuracy of the data: it comes from public sources of Renfe Operadora that may be updated or interrupted.',
    s2Titulo: 'Accounts and abusive use',
    s2Texto:
      'You are responsible for your account. Intensive automated use (scraping of the platform), impersonation and any use that harms the service are prohibited. We may suspend accounts that breach these terms.',
    s3Titulo: 'Intellectual property',
    s3Texto:
      '<strong>The MantiRenfe software belongs to its author.</strong> Train data belongs to Renfe Operadora (open data with mandatory attribution) and the "Renfe", "Ouigo" or "Iryo" marks to their owners; their use is purely informative without implying endorsement.',
    s4Titulo: 'Limitation of liability',
    s4Texto:
      'The service is provided "as is": we are not liable for decisions taken based on the notices (including ticket purchases), nor for interruptions derived from the data sources. These terms may be updated; continued use implies acceptance.',
  },

  // ──────────────────────────────── página de incidencias
  incidencias: {
    titulo: 'Service incidents',
    subtitulo:
      'Service notices and incidents for commuter rail published by Renfe in real time, updated every minute',
    vacio:
      'There are no active incidents right now. If one appears, you will see it here as soon as Renfe’s feed publishes it.',
    sinEstacion: 'Affects service lines, no specific station reported',
    tituloFallback: 'Service incident',
    periodoDesde: 'From {{fecha}}',
    periodoHasta: 'Until {{fecha}}',
    periodoSin: 'Period not specified',
  },

  // ──────────────────────────────── página de puntualidad
  puntualidad: {
    titulo: 'The least punctual trains',
    subtitulo:
      'Monthly ranking of routes (origin → destination) with delays of 5 minutes or more, measured with Renfe’s live data',
    mes: 'Month',
    ordenVeces: 'Most often late',
    ordenMedia: 'Highest average delay',
    vacio:
      'No punctuality data for this month yet. Come back in a while: we measure delays in real time while the map and alerts are running.',
    descripcion:
      'Late services = trips on the same route (origin → destination) that arrived 5+ minutes late',
    colTren: 'Train',
    colTrayecto: 'Route',
    colSalida: 'Departure',
    colLlegada: 'Arrival',
    colLlegadaEstimada: 'Estimated arrival',
    colServicios: 'Late services',
    colRetrasoMedio: 'Average delay',
    colPeorRetraso: 'Worst delay',
    nota: 'Estimated arrival = scheduled arrival + worst delay recorded this month: an indicative estimate, not an official time.',
  },

  // ──────────────────────────────── página de suprimidos
  suprimidos: {
    titulo: 'Cancelled trains',
    subtitulo: 'Cancellations detected in Renfe’s GTFS-RT feed, updated every 5 minutes',
    consultar: 'Search',
    consultarDescripcion: 'No account needed. We only keep the last {{dias}} days of detections.',
    estacionLabel: 'Station (optional)',
    fechaLabel: 'Date',
    buscar: 'Search',
    quitarFiltro: 'Remove {{estacion}} filter',
    resultados: 'Results',
    resultadosDesc: '{{trenes}} cancelled trains · {{fecha}}',
    resultadosDescEstacion: '{{trenes}} cancelled trains · {{fecha}} · {{estacion}}',
    sinTrenes: 'No cancelled trains for that date/station',
    nadaReportar:
      'Nothing to report: there are no cancelled trains recorded for <strong>{{fecha}}</strong>.',
    nadaReportarEstacion:
      'Nothing to report: there are no cancelled trains recorded for <strong>{{fecha}}</strong> passing through <strong>{{estacion}}</strong>.',
    notaAntes:
      'Detection covers long-distance services; commuter trains are rarely cancelled in the feed. If you expected a cancellation, also check the ',
    notaBoton: 'service incidents',
    notaDespues: '.',
    colTren: 'Train',
    colOrigenDestino: 'Origin → Destination',
    colSalida: 'Departure',
    colLlegada: 'Arrival',
    colDatos: 'Data',
    sinDatos: 'No data',
    error: 'Error while fetching cancelled trains',
  },

  // ──────────────────────────────── página de trenes (búsqueda de horarios)
  trenes: {
    titulo: 'Search trains',
    subtitulo:
      'Scheduled timetables between stations (Renfe GTFS and the other operators’ feeds, synchronised)',
    buscadorTitulo: 'Your journey',
    buscadorDescripcion: 'Browse without an account. Alerts do require sign-in.',
    origenLabel: 'Origin',
    destinoLabel: 'Destination',
    botonBuscar: 'Search timetables',
    buscando: 'Searching...',
    resultados: 'Results',
    resultadosDesc: '{{trenes}} trains · source: {{fuente}}',
    sinEstacion: 'Station not found',
    estacionIndicada: 'the indicated one',
    sinTrenes: 'No direct or connecting trains for that date',
    desde: 'From',
    hasta: 'To',
    mostrando: 'Showing {{visibles}} of {{total}} departures',
    limpiar: 'Clear',
    compara: 'Compare operators: {{lista}}',
    avisoAlertas:
      'Alerts only cover what their criterion allows: availability and delay come from Renfe’s data, and the timetable from this same GTFS.',
    avisoOuigo:
      ' That is why an Ouigo train is not watched by an availability alert. Ouigo data: NAP of the Ministry — ',
    avisoOuigoEnlace: 'Powered by MITRAMS',
    sinEstacionTexto:
      'We could not find the station <strong>{{estaciones}}</strong>. Check the spelling (accents, «La Coruña» = «A Coruña») or pick a suggestion while typing.',
    notaEstacionesAntes: 'If it does not appear, try searching in the ',
    notaEstacionesBoton: 'stations',
    sinTrenesTexto:
      'No direct or connecting trains from <strong>{{origen}}</strong> to <strong>{{destino}}</strong> on <strong>{{fecha}}</strong>. Try another date or split the journey in two legs.',
    crearAlerta: 'Create availability alert',
    teAvisamos: 'We will tell you when Renfe opens seats for that route and date.',
    ningunoFranja: 'No departures in that time window',
    limpiarFiltro: 'Clear filter',
    transbordoDetalle:
      '{{tren1}} arrives at {{llegada1}} · wait {{minutos}} min · {{tren2}} departs at {{salida2}}',
    alerta: 'Alert',
    errorBusqueda: 'Search error',
  },

  // ──────────────────────────────── página de estaciones
  estaciones: {
    subtitulo:
      'Search by name or by city/area —try «Vigo»— to see today’s departures, the incidents affecting that station and its location on the map.',
    buscarTitulo: 'Search station',
    buscarDescripcion:
      'The search tolerates accents and abbreviations: typing «Vigo» shows every station in the city.',
    estacionLabel: 'Station',
    placeholder: 'Vigo-Guixar, Madrid-Atocha, Valencia...',
    ayuda:
      'Type at least 2 letters. If you cannot find it, try the city, the region or the province.',
    crearAlertaFila: 'Create alert',
    listadoTitulo: 'All stations',
    listadoCargando: 'Loading...',
    listadoFin: 'End of the list',
    listadoError: 'Could not load the station list',
    codigo: 'Code {{codigo}}',
    badgeEstacion: 'Station {{codigo}}',
    incidenciaActiva: '1 active incident',
    incidenciasActivas: '{{n}} active incidents',
    sinIncidencias: 'No incidents',
    verEnMapaBoton: 'View on the map',
    cargandoOficiales: 'Loading official data...',
    direccion: 'Address',
    cp: 'Postcode',
    poblacion: 'Town',
    provincia: 'Province',
    verEnMapa: 'View on map',
    aforoTitulo: 'Historical footfall data (2018)',
    aforoBadge: '2018 history',
    franja: 'Slot',
    viajeros: 'Passengers',
    aforoNota:
      'Passengers boarding and alighting per time slot — source: data.renfe.com (“Passenger volume by time slot”, 2018).',
    estacionesList: 'Stations: {{lista}}',
    salidasTitulo: 'Today’s departures',
    salidasDesde: ' · scheduled departures from {{estacion}}',
    actualizar: 'Refresh',
    actualizarSalidas: 'Refresh departures',
    sinSalidas: 'No departures today',
  },

  // ──────────────────────────────── página del mapa
  mapa: {
    titulo: 'Live map',
    subtitulo: 'GTFS-RT positions for commuter and long-distance trains · updated every 30 s',
    placeholder: 'Filter trains...',
    filtrarAria: 'Filter map trains',
    recuentoFiltrado: '{{visibles}} / {{total}} trains',
    recuento: '{{total}} trains',
    actualizar: 'Refresh',
    errorApiAntes: ' — check the API or the GTFS-RT URL in ',
    errorApiDespues: '.',
    sinCoincidencias: 'No trains match «{{filtro}}». Clear the filter to see them all.',
    redTitulo: 'Rail network',
    redDatos: 'Data: Renfe Operadora (open data CC-BY 4.0) · Map © OpenStreetMap',
    tren: 'Train',
    salida: 'Departure {{hora}}',
    llegada: ' · Arrival {{hora}}',
    compromiso: 'Renfe commitment: {{texto}}',
    actualizado: 'Updated {{hora}}',
    cargando: 'Loading...',
    ocultarTraza: 'Hide track',
    verTraza: 'Show track (24 h)',
    soloPunto: 'Only 1 point recorded (sampled every 10 min) — press again in a while.',
    errorCarga: 'Could not load the positions',
    pie: 'Renfe Punctuality Commitment (source: renfe.com, checked 27/09/2026) · informational only: the actual refund percentage depends on the service type and the applicable exclusions.',
  },

  // ──────────────────────────────── cuenta atrás y estados del dashboard
  viaje: {
    hoy: 'Today',
    manana: 'Tomorrow',
    haSalido: 'departed',
    cuentaMenosDeUno: 'under 1 min to go',
    cuentaDias: '{{dias}} d {{horas}} h to go',
    cuentaHoras: '{{horas}} h to go',
    cuentaHorasMin: '{{horas}} h {{min}} min to go',
    cuentaMinutos: '{{min}} min to go',
  },

  // ──────────────────────────────── histórico de precios (detalle de alerta)
  precios: {
    serieTren: ' · train {{tren}}',
    serieResumen: '(no change · {{n}} poll{{plural}})',
    sondeosOcultos1: '…and 1 earlier poll',
    sondeosOcultosN: '…and {{n}} earlier polls',
    sinDatos: 'No price data yet',
    sube: 'Going up: the minimum was {{precio}} on {{fecha}}',
    haBajado: 'The price has dropped from {{precio}} → good time to buy',
    estable: 'Price stable over the last {{horas}} h',
  },

  // ──────────────────────────────── fichero .ics del calendario
  ics: {
    aviso: 'Alert: {{ruta}}',
    tren: ' (train {{tren}})',
    alerta: 'MantiRenfe alert: {{ruta}}',
    fecha: 'Date: {{fecha}}',
    franja: 'Window: {{desde}} – {{hasta}}',
    trenLinea: 'Train {{tren}}',
    recordatorio: 'Departure reminder: {{ruta}}',
  },

  // ──────────────────────────────── errores genéricos de la web
  errores: {
    sinSesion: 'No active session: please sign in again',
    status: 'Error {{status}}',
    authNoConfig: 'Authentication not configured (VITE_SUPABASE_URL)',
    // Fetch timeout (15 s): the raw browser error is never shown
    timeout: 'The request took too long: check your connection and try again',
    // Messages per status: the raw server detail only goes to console.error
    status400: 'Invalid data: check the fields and try again',
    status401: 'Your session has expired: please sign in again',
    status403: 'You do not have permission to do this',
    status404: 'The page you are looking for was not found',
    status409: 'This conflicts with the saved data: reload the page and try again',
    status429: 'Too many requests: wait a few seconds and try again',
    status500: 'Server error: please try again in a few minutes',
  },

  // ──────────────────────────────── dashboard
  dashboard: {
    titulo: 'Dashboard',
    saludo: 'Hello{{nombre}} — your trains at a glance',
    nuevaAlerta: 'New alert',
    alertasActivas: 'Active alerts',
    avisosSinLeer: 'Unread notices',
    totalAlertas: 'Total alerts',
    ultimosAvisos: 'Latest notices',
    ultimosAvisosDesc: 'Availability and change notifications',
    sinAvisos: 'No notices yet. As soon as a seat opens up we will tell you here and by push.',
    misAlertasDesc: 'Routes we are watching',
    sinAlertas: 'Create your first alert and we will watch your train.',
    errorPanel: 'Could not load the dashboard: {{error}}',
    estadoHecha: 'Done',
    proximoViaje: 'Your next trip',
    sinSalidasTitulo: 'No departure in sight yet',
    sinAlertasTexto:
      'Create your first alert and you will see your next departure here with the countdown and seat availability.',
    sinSalidasTexto:
      'There is no departure in sight right now: as soon as your alert has a train with a date, it will show up here with the countdown.',
    horaPorConfirmar: 'time TBC',
    trenNumero: 'train {{numero}}',
    sinDatosPlazas: 'We do not know the seat availability yet: we check every {{min}} min',
    verAlerta: 'View alert',
    // ──────────────────────────────── “Your activity” (history + stats)
    actividadTitulo: 'Your activity ({{dias}} days)',
    actividadDesglose: 'Notices by type',
    actividadAviso1: '1 notice',
    actividadAvisosN: '{{n}} notices',
    actividadActiva1: '1 active alert',
    actividadActivasN: '{{n}} active alerts',
    actividadCompletada1: '1 completed alert',
    actividadCompletadasN: '{{n}} completed alerts',
    actividadTipoAlertas: 'Seats, timetables and delays',
    actividadTipoCancelacion: 'Cancellations',
    actividadTipoParadaSuprimida: 'Cancelled stops',
    actividadTipoIncidencia: 'Service incidents',
    actividadTipoRecordatorio: 'Departure reminders',
    actividadTipoResumenViaje: 'Trip summaries',
    actividadTipoPrecio: 'Price alerts',
    actividadTipoDigest: 'Daily email digest',
    actividadTipoSemanal: 'Weekly summary',
    actividadTipoOtro: 'Other',
  },

  // ──────────────────────────────── listado de alertas
  alertas: {
    subtitulo: 'Watched routes and their polling status',
    filtroTodas: 'All',
    filtroActivas: 'Active',
    filtroPausa: 'Paused',
    filtroCompletadas: 'Completed',
    estadoActiva: 'Active',
    estadoPausa: 'Paused',
    completada: 'Completed',
    // Frequency badge built from the days the alert is set to
    diasTodos: 'Every day',
    diasLaborables: 'Mon–Fri',
    aviso1: '1 notice',
    avisosN: '{{n}} notices',
    avisosTitulo: 'Notices received by this alert',
    pausar: 'Pause',
    reanudar: 'Resume',
    editar: 'Edit',
    avisos: 'Notices',
    eliminarAria: 'Delete alert',
    sinAlertasTitulo: 'You have no alerts yet',
    sinAlertasTexto: 'Create one for your next trip and we will tell you if a seat opens up.',
    crearPrimera: 'Create the first one',
    sinEstado: 'No alerts with that status.',
    desdeHora: 'from {{hora}}',
    cadaMin: 'every {{min}} min',
    bono: 'railcard {{bono}}',
    criterio: {
      DISPONIBILIDAD: 'Seats available',
      HORARIO: 'Timetable',
      RETRASO: 'Delay',
      APERTURA_VENTA: 'Sales opening',
      PRECIO: 'Price',
    },
    precioObjetivo: 'Target: ≤{{precio}}',
    ultimoSondeo: 'Last checked: {{fecha}}',
    toastReanudada: 'Alert resumed',
    toastPausa: 'Alert paused',
    toastNoActualizar: 'Could not update',
    toastEliminada: 'Alert deleted',
    toastNoEliminar: 'Could not delete',
    dialogoTitulo: 'Delete this alert?',
    dialogoTexto:
      'We will stop watching {{origen}} → {{destino}} on {{fecha}}. This action cannot be undone.',
  },

  // ──────────────────────────────── alta/edición de alertas
  nuevaAlerta: {
    volver: 'Back',
    editarTitulo: 'Edit alert',
    nuevaTitulo: 'New alert',
    editarSub: 'Change anything you like; we will reset the notices if the route changes',
    nuevaSub: 'We will tell you when availability changes on this route',
    trayectoTitulo: 'Route to watch',
    trayectoDesc: 'The more specific you are, the fewer unnecessary notices you will get',
    cuandoViajas: 'When do you travel?',
    frecuenciaFecha: 'One date',
    frecuenciaFlexible: 'Any date',
    frecuenciaDiaria: 'Every day',
    frecuenciaDias: 'Specific days',
    recurrenteDiaria:
      'Everyday commute: we will alert you every day. No date needed: it renews automatically.',
    pistaDias: 'We will only alert you on the days you pick',
    pistaFlexible:
      'We will watch any date between today and 6 months from now: we will tell you as soon as tickets go on sale.',
    errorDias: 'Pick at least one day of the week',
    fechaLabel: 'Travel date',
    horaDesdeLabel: 'Time from (optional)',
    horaHastaLabel: 'Time to (optional)',
    trenLabel: 'Specific train (optional)',
    trenPlaceholder: 'E.g. 03311 — leave empty to watch every train',
    proximos: 'Next:',
    elegirProximo: 'Pick one of the next ones or leave it empty to watch them all.',
    criterioLabel: 'What do you want to detect',
    criterioDisponibilidad: 'A seat becomes free',
    criterioHorario: 'Timetable changes',
    criterioRetrasoTren: 'Train delays',
    criterioVenta: 'Ticket sales open',
    criterioPrecio: 'The price drops',
    intervaloLabel: 'Polling frequency',
    intervaloCada: 'Every {{min}} minutes',
    precioLabel: 'Alert me if it drops below X €',
    precioPlaceholder: '35',
    precioTexto: 'We will tell you the first time a train reaches that price or lower.',
    bonoLabel: 'Your railcard / profile',
    bonoTexto:
      'We store your profile to personalise the notices. Renfe does not publish seats per railcard in its public data: availability notices are calculated on the standard fares for sale.',
    bonoGeneral: 'No railcard / standard',
    bonoBono10: 'Bono 10',
    bonoBono20: 'Bono 20',
    bonoJuvenil: 'Young railcard',
    bonoEstudiante: 'Student',
    bonoDiscapacidad: 'Disability',
    bonoFamilia: 'Large family',
    bonoMayor60: 'Over 60',
    bonoOtro: 'Other',
    notasLabel: 'Notes (optional)',
    notasPlaceholder: 'E.g. tourist class only, I want the evening train...',
    resumenTitulo: 'Alert summary',
    resumenProximas: 'Next departures: {{horas}}',
    resumenFlexible: 'Any date (next 6 months)',
    resumenSinFecha: 'No date',
    criterioPlazas: 'Free seats',
    criterioRetraso: 'Delay',
    criterioHorarioCorto: 'Timetable',
    criterioVentaCorta: 'Sales opening',
    criterioPrecioCorto: 'Price',
    guardando: 'Saving...',
    guardarCambios: 'Save changes',
    crearYVigilar: 'Create alert and start watching',
    errorOrigenDestino: 'Set the origin and destination stations',
    errorFecha: 'Select the travel date',
    errorPrecio: 'Set the target price (€) for the notice',
    errorCampos: 'Check the form fields',
    errorCargar: 'Could not load the alert',
    errorGuardar: 'Could not save the alert',
    toastActualizada: 'Alert updated: {{resumen}}.',
    toastCreada: 'Alert created: {{resumen}}. We have started watching it.',
    accionVuelta: 'Create the return leg',
    tambienVuelta: 'Also the return leg',
    tambienVueltaDesc:
      'We will create the return alert with the same criteria and time window, on the same date.',
    tambienVueltaRiesgo:
      'The return alert will use the SAME date as the outbound leg: if you come back another day, edit it afterwards.',
    toastCreadasVuelta:
      '2 alerts created: outbound and return ({{resumen}}). We have started watching them.',
    errorVuelta: 'Outbound alert created; the return leg failed: please try again.',
  },

  // ──────────────────────────────── detalle de alerta
  detalleAlerta: {
    volver: 'Back to my alerts',
    titulo: 'Alert detail',
    incidenciaTitulo: 'Service incident that may affect this route',
    rangoFechas: 'From {{desde}} to {{hasta}}',
    verTodas: 'See all incidents',
    sondeoNinguno: 'none',
    compartir: 'Share',
    enlaceCopiado: 'Link copied',
    promptCompartir: 'Copy the link to share this route',
    calendario: 'Add to calendar',
    eventoDescargado: 'Event downloaded: open it to add it to your calendar',
    errorIcs: 'Could not download the calendar file',
    notas: 'Notes: {{texto}}',
    retrasosHoy: 'Today’s delays',
    plazasHoy: 'Today’s seats',
    sondeoSinDatos: 'This alert has not been polled yet',
    sondeoHace: 'Last checked: {{hace}}',
    haceMomento: 'just now',
    haceMin: '{{min}} min ago',
    colHora: 'Time',
    colPlazas: 'Seats',
    colPrecioDesde: 'Price from',
    noParaEn: 'Does not stop at: {{lista}}',
    vacioRetrasoSinSondeo: 'This alert has not been polled yet — it is checked every {{min}} min',
    vacioRetrasoFranja: 'No delays right now in your time window ({{franja}})',
    vacioRetrasoRuta: 'No delays right now on your route',
    vigilanciaTren: ' — watching 1 train',
    vacioPrecio: 'No price data yet — it is checked every {{min}} min',
    vacioPlazas: 'No seat data yet — it is checked every {{min}} min',
    vacioSoloDisponibilidad: 'Only for availability alerts',
    precioEvolucion: 'Price trend',
    precioEvolucionDesc: 'Buy now or wait? Points recorded on each poll',
    precioSinHistorico:
      'No price history yet — it is recorded when the price changes or seats appear.',
    precioBase: 'Based on our polls every {{min}} min; indicative selling price',
    avisoTitulo: 'Notices for this alert',
    avisoDesc: 'History of the notifications we have sent',
    sinAvisos: 'We have not sent any notices for this alert yet.',
    nuevo: 'New',
    tooltipSondeo1: '1 poll',
    tooltipSondeoN: '{{n}} polls',
    tooltipDisponible: 'available',
    tooltipCompleto: 'full',
  },

  // ──────────────────────────────── bandeja de notificaciones
  notificaciones: {
    pushActivo: 'Push enabled ✓',
    pushDesactivado: 'Push disabled',
    sinSoporteIos:
      'Safari does not support web push on iPhone. Use the MantiRenfe app or add the site to your Home Screen (Safari → Share → Add to Home Screen).',
    subtitulo: 'Notices from your alerts and reminders',
    activando: 'Enabling...',
    activarPush: 'Enable push',
    marcarLeidas: 'Mark as read',
    limpiarLista: 'Clear list',
    bandeja: 'Inbox',
    bandejaDesc: 'Push notices also appear here',
    sinNotifs: 'You have no notifications yet. Create an alert and they will show up here.',
    marcarOk: 'Marked as read',
    vaciarConfirm: 'Clear the notice list? All of them will be deleted.',
    vaciada: 'List cleared',
    sinSoporte: 'Your browser does not support push notifications',
    permisoDenegado: 'Notification permission denied',
    pushNoConfig: 'Push not configured on the server (missing VAPID keys)',
    pushOk: 'Push notifications enabled',
    pushError: 'Could not enable push',
  },

  // ──────────────────────────────── ajustes
  ajustes: {
    subtituloApp: 'Application settings',
    subtitulo: 'Your profile and notifications',
    temaTitulo: 'Theme',
    temaDesc: 'Light or dark appearance',
    supabaseInfo: 'Set up Supabase to unlock the profile, alerts and notifications.',
    cuentaTitulo: 'Account',
    cuentaDesc: 'Your session details',
    proveedor: 'Provider: {{proveedor}}',
    notificacionesTitulo: 'Notifications',
    notificacionesDesc: 'How you want to receive the notices',
    pushLabel: 'Push notifications',
    pushDesc: 'Notifications',
    emailLabel: 'Email notifications',
    emailDesc: 'Digest when a seat is available',
    recordatorioLabel: 'Countdown to departure',
    recordatorioDesc: '“X minutes to go before your train”',
    resumenLabel: 'Trip summary',
    resumenDesc: 'On the morning of the trip: timetable, train and delays',
    antelacionLabel: 'Remind me in advance',
    antelacionOpcion: '{{min}} minutes before',
    aparienciaTitulo: 'Appearance',
    aparienciaDesc: 'Application theme',
    guardadas: 'Preferences saved',
    noGuardar: 'Could not save',
  },

  // ──────────────────────────────── errores de Supabase Auth
  erroresAuth: {
    credenciales:
      'Wrong email or password. If you just created the account, make sure you used the same password.',
    confirmarEmail: 'Email not confirmed: check your inbox (and spam).',
    cuentaExiste: 'An account with that email already exists. Sign in instead.',
    emailInvalido:
      'Supabase rejected that email: check the allowed domains list in Authentication → Settings.',
    passwordDebil: 'The password is too weak: use at least 8 characters.',
    proveedor:
      'This sign-in provider (Google/Outlook) is not enabled yet in Supabase → Authentication → Providers.',
    registroDeshabilitado: 'Sign-ups are disabled in Supabase → Authentication → Settings.',
    limiteIntentos: 'Too many attempts in a row: wait a minute and try again.',
    emailNoAceptado:
      'Supabase does not accept that email (it may be on the blocked domains list). Try another address.',
  },
};
