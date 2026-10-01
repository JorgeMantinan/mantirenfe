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
    error: 'Error',
    cancelar: 'Cancel',
    eliminar: 'Delete',
    editar: 'Edit',
    cerrar: 'Close',
    compartir: 'Share',
    email: 'Email',
    contrasena: 'Password',
    nombre: 'Name',
    origen: 'Origin',
    destino: 'Destination',
    nuevo: 'New',
    cancelado: 'Cancelled',
    completo: 'Full',
    hayPlazas: 'Seats available',
    sinDatos: 'No data',
    plazas: 'Seats',
    errorActualizar: 'Could not be updated',
    avisoConfig: 'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are missing in .env',
    y: ' and ',
    incidencias: 'Service incidents',
    suprimidos: 'Cancelled trains',
    iniciarSesion: 'Sign in',
    crearCuenta: 'Sign up',
  },

  // ──────────────────────────────── pestañas
  pestanas: {
    alertas: 'Alerts',
    trenes: 'Trains',
    avisos: 'Notices',
    ajustes: 'Settings',
  },

  // ──────────────────────────────── inicio (app/index.tsx)
  inicio: {
    lema: 'Seat alerts, trip countdown and trains in real time',
  },

  // ──────────────────────────────── login
  login: {
    google: 'Continue with Google',
    oauthError:
      'Could not sign in with Google. Make sure Google is enabled in Supabase and the deep link is allowed in Redirect URLs.',
    faltanTitulo: 'Missing details',
    faltanCuerpo: 'Enter your email and password',
    errorGenerico: 'Could not sign in',
    entrando: 'Signing in...',
    entrar: 'Sign in',
    sinCuenta: "Don't have an account? Sign up",
  },

  // ──────────────────────────────── registro
  registro: {
    revisaTitulo: 'Check your details',
    revisaCuerpo: 'Name, email and password (min. 6) are required',
    creadaTitulo: 'Account created',
    creadaConfirmacion: 'Check your email to confirm the sign-up.',
    creadaDentro: 'You are already signed in to the account.',
    errorGenerico: 'Could not sign up',
    placeholderNombre: 'Your name',
    placeholderContrasena: 'At least 6 characters',
    creando: 'Creating...',
    cuentaExiste: 'Already have an account? Sign in',
  },

  // ──────────────────────────────── nueva alerta (alertas/nueva.tsx)
  nueva: {
    titulo: 'New alert',
    editarTitulo: 'Edit alert',
    editarSubtitulo: 'Change any detail; we will reset the notices if the route changes',
    errorCargar: 'Could not load the alert',
    errorGuardar: 'Could not save the alert',
    revisaCampos: 'Check the fields',
    datosInvalidos: 'Invalid data',
    creadaTitulo: 'Alert created',
    creadaCuerpo: '{{resumen}}\n\nWe start watching this route.',
    actualizadaTitulo: 'Alert updated',
    actualizadaCuerpo: '{{resumen}}\n\nThe changes are already applied.',
    ahoraNo: 'Not now',
    crearVuelta: 'Create the return trip',
    tipoAviso: 'Alert type',
    precioObjetivo: 'Notify me if it drops below X €',
    placeholderPrecio: 'E.g. 30',
    placeholderOrigen: 'Origin station',
    placeholderDestino: 'Destination station',
    cuando: 'When do you travel?',
    cotidianoDiaria: 'Daily commute: we will alert you every day. No need to set a date.',
    cotidianoLaborables:
      'Daily commute: we will alert you from Monday to Friday. No need to set a date.',
    fechaViaje: 'Travel date',
    minimo: 'Minimum: {{fecha}}',
    franja: 'Time window (optional)',
    desdeHora: 'From HH:MM',
    hastaHora: 'To HH:MM',
    soloFranja: 'We only warn you about departures inside that window',
    trenConcreto: 'Specific train (optional)',
    placeholderTren: 'E.g. 03311 — leave empty for all trains',
    proximosTrenes: 'Upcoming trains (tap to pick):',
    intervalo: 'Polling interval',
    bono: 'Pass',
    avisoBono:
      'We save your profile to personalise the alerts. Renfe does not publish seats per pass quota: availability alerts are computed on standard fares.',
    notas: 'Notes (optional)',
    placeholderNotas: 'E.g. seat by the window...',
    resumenTitulo: 'Alert summary',
    proximasSalidas: 'Upcoming departures: {{salidas}}',
    creando: 'Creating...',
    crear: 'Create alert',
    sinFecha: 'No date',
    cadaMin: 'every {{min}} min',
    resumenLaborables: 'Mon-Fri',
    criterio: {
      disponibilidad: 'Seats available',
      retraso: 'Delay',
      horario: 'Timetable',
      aperturaVenta: 'Sales opening',
      precio: 'Price',
    },
    desc: {
      disponibilidad: 'We will alert you when seats are available on this route',
      retraso: 'We will alert you when your trains run late (5+ min)',
      horario: 'We will alert you if the published timetable changes',
      aperturaVenta: 'We will alert you when ticket sales open',
      precio: 'We will alert you if the price drops below your target',
    },
    frecuencia: {
      fecha: 'One date',
      diaria: 'Every day',
      laborables: 'Monday to Friday',
    },
  },

  // ──────────────────────────────── detalle de alerta (alertas/[id].tsx)
  detalle: {
    titulo: 'Alert',
    haceMomento: 'just now',
    haceMin: '{{min}} min ago',
    sinSondeo: 'This alert has not been polled yet — it is checked every {{min}} min',
    enFranja: 'in your window ({{franja}})',
    enRuta: 'on your route',
    vigilamos1: ' — we watch 1 train',
    sinRetrasos: 'No delays right now {{donde}}{{vigilancia}}',
    sinPrecio: 'No price data yet — it is checked every {{min}} min',
    sinPlazas: 'No seat data yet — it is checked every {{min}} min',
    soloDisponibilidad: 'Only for seat availability alerts',
    llega: 'arrives {{hora}}',
    compartirTitulo: 'Share alert',
    calendarioTitulo: 'Add to calendar',
    calendarioError:
      'The event could not be shared. Try again or open MantiRenfe in your browser to download the .ics file.',
    laborables: 'Mon-Fri: every working day',
    cadaDia: 'Every day',
    metaAlerta: '{{fecha}} · {{criterio}} · every {{min}} min · {{bono}}',
    objetivo: 'Target: alert me below {{precio}}',
    franja: 'Window: {{desde}} – {{hasta}}',
    trenSufijo: ' · train {{tren}}',
    tren: 'Train {{tren}}',
    ultimoSondeo: 'Last check: {{valor}}',
    ninguno: 'none yet',
    hoyRetrasos: "Today's delays",
    hoyPlazas: "Today's seats",
    desde: 'From {{precio}}',
    noPara: 'Does not stop at: {{lista}}',
    evolucionTitulo: 'Price history',
    evolucionSubtitulo: 'Buy now or wait? One dot per poll',
    sinEvolucion: 'No price history yet',
    avisosTitulo: 'Notices for this alert',
    sinAvisos: 'No notices for this alert yet.',
  },

  // ──────────────────────────────── lista de alertas ((tabs)/index.tsx)
  lista: {
    titulo: 'My alerts',
    nueva: '+ New',
    vacioTitulo: 'You have no alerts yet',
    vacioTexto: 'Create one for your next trip and we will notify you if a seat opens up.',
    crearPrimera: 'Create the first one',
    eliminarTitulo: 'Delete alert',
    eliminarCuerpo: 'Watch {{origen}} → {{destino}}?',
    a11yVer: 'View details from {{origen}} to {{destino}}',
    a11yPista: 'Shows seats, price history and notices',
    metaAlerta: '{{fecha}} · every {{min}} min · {{bono}}',
    pausar: 'Pause',
    reanudar: 'Resume',
  },

  // ──────────────────────────────── tarjeta «Tu próximo viaje»
  viaje: {
    titulo: 'Your next trip',
    vacio: 'No departures on the way yet',
    a11yRuta: '{{origen}} to {{destino}}',
    a11yPista: 'Opens the alert details',
    horaPorConfirmar: 'time TBC',
    tren: 'train {{tren}}',
    sinPlazas: 'We do not know the seats yet: we check every {{min}} min',
    tambien: 'Also:',
    a11yFila: '{{fila}} from {{origen}} to {{destino}}',
  },

  // ──────────────────────────────── your activity ((tabs)/index.tsx)
  actividad: {
    titulo: 'Your activity',
    dias: '{{n}} days',
    aviso1: '1 notice',
    avisosN: '{{n}} notices',
    activa1: '1 active alert',
    activasN: '{{n}} active alerts',
    completada1: '1 completed alert',
    completadasN: '{{n}} completed alerts',
    desglose: 'By type',
    tipoAlertas: 'Seats, timetables and delays',
    tipoCancelacion: 'Cancellations',
    tipoParadaSuprimida: 'Cancelled stops',
    tipoIncidencia: 'Service incidents',
    tipoRecordatorio: 'Departure reminders',
    tipoResumenViaje: 'Trip summaries',
    tipoPrecio: 'Price alerts',
    tipoDigest: 'Daily email digest',
    tipoSemanal: 'Weekly summary',
    tipoOtro: 'Other',
  },

  // ──────────────────────────────── avisos ((tabs)/avisos.tsx)
  avisos: {
    sinLeer: '{{n}} unread',
    todoAlDia: 'All up to date',
    marcarLeidas: 'Mark as read',
    limpiar: 'Clear',
    limpiarTitulo: 'Clear notices',
    limpiarCuerpo: 'Delete all notices from the list?',
    borrar: 'Delete',
    errorVaciar: 'Could not empty the list',
    vacioTitulo: 'No notices yet',
    vacioTexto: 'When an alert detects a change, the notice will appear here.',
  },

  // ──────────────────────────────── trenes ((tabs)/trenes.tsx)
  trenes: {
    modo: {
      estaciones: 'Stations',
      horarios: 'Timetables',
      posiciones: 'Live',
      impuntuales: 'Late trains',
    },
    franja: {
      todo: 'All',
      manana: 'Morning (06-12)',
      tarde: 'Afternoon (12-20)',
      noche: 'Night (20-24)',
    },
    orden: {
      veces: 'Most late',
      retraso: 'Worst delay',
    },
    vistaLista: 'List',
    vistaMapa: 'Map',
    placeholderBuscar: 'Search station...',
    placeholderFiltrar: 'Filter trains (no., origin, destination)...',
    placeholderOrigen: 'Origin (e.g. Madrid)',
    placeholderDestino: 'Destination (e.g. Sevilla)',
    buscando: 'Searching...',
    buscarHorarios: 'Search timetables',
    errorBusqueda: 'Search error',
    cargandoSalidas: 'Loading departures...',
    salidasDe: 'Departures from {{estacion}} today',
    cargandoEstacion: 'Loading station data…',
    verMapa: 'View on map',
    aforo: 'Historic usage (2018)',
    viajeros: '{{n}} passengers',
    sinSalidas: 'No departures recorded today',
    tocaSalidas: '{{meta}} — tap to see departures',
    noEstaciones: 'No stations found',
    estacionNoEncontrada: 'Station not found',
    sinTrenesRuta: 'No trains on that route',
    noEncontramos:
      'We could not find the station {{lista}}. Check the spelling (accents: «La Coruña» = «A Coruña»).',
    indicada: 'the one you entered',
    sinDirectos:
      'No direct or connecting trains from {{origen}} to {{destino}} on {{fecha}}. Try another day or split the trip in two.',
    crearAlerta: 'Create availability alert',
    mostrando: 'Showing {{visibles}} of {{total}} departures',
    sinSalidasFranja: 'No departures in that window',
    pruebaFranja: 'Try another window or go back to «{{todo}}».',
    transbordo: 'Change at {{estacion}}',
    transbordoDetalle:
      '{{tren1}} arrives at {{hora1}} · {{espera}} min wait · {{tren2}} departs at {{hora2}}',
    masAlerta: '+ Alert',
    sinPosiciones: 'No GTFS-RT positions right now',
    sinCoincidencias: 'No trains matching «{{filtro}}»',
    aTiempo: 'On time',
    salidaHora: 'Departs {{hora}}',
    llegadaHora: 'Arrives {{hora}}',
    compromiso: 'Renfe commitment: {{texto}}',
    cargandoImpuntualidad: 'Loading punctuality…',
    sinImpuntualidad: 'No punctuality data for this month yet',
    veces: '{{n}} times',
    retrasoMedio: 'Average delay {{medio}} · Worst {{peor}}',
    llegadaEstimada: 'estimated {{hora}} (max. delay)',
  },

  // ──────────────────────────────── ajustes ((tabs)/ajustes.tsx)
  ajustes: {
    antelacion: 'Reminder lead time',
    antelacionMin: '{{n}} min',
    cuenta: 'Account',
    sinSesion: 'Signed out',
    supabaseSinConfig: 'Supabase is not configured in this environment',
    apariencia: 'Appearance',
    temaClaro: 'Light',
    temaOscuro: 'Dark',
    temaSistema: 'System',
    idioma: 'Language',
    notificaciones: 'Notifications',
    pushDisponibilidad: 'Availability push',
    pushOk: 'Push notifications enabled on this device',
    pushKo: 'Push notifications disabled on this device',
    pushError: 'Could not update the push registration',
    recordatorio: 'Departure reminder (50 min)',
    resumen: 'Trip summary (morning of the day)',
    guardando: 'Saving...',
    cerrarSesion: 'Sign out',
  },

  // ──────────────────────────────── incidencias
  incidencias: {
    titulo: 'Service incidents',
    subtitulo: 'Real-time commuter alerts and incidents published by Renfe',
    vacioTitulo: 'No active incidents right now',
    vacioTexto: 'If any appear, you will see them here as soon as Renfe publishes the feed.',
    fallbackTitulo: 'Service incident',
    sinEstacion: 'Affects service lines, no specific station indicated',
    desde: 'From {{fecha}}',
    hasta: 'Until {{fecha}}',
    sinPeriodo: 'No period indicated',
  },

  // ──────────────────────────────── suprimidos
  suprimidos: {
    consultar: 'Check cancellations',
    fecha: 'Date (YYYY-MM-DD)',
    historico: 'History available: from {{fecha}}',
    fechaInvalida: 'Invalid date: use YYYY-MM-DD between {{fecha}} and today',
    estacion: 'Station (optional)',
    quitarFiltro: 'Remove the {{estacion}} filter',
    buscar: 'Search',
    buscando: 'Searching...',
    buscandoLista: 'Searching cancellations…',
    vacio:
      'No cancelled trains on that date (we cover long distance; commuter services rarely cancel)',
    tren: 'train {{tren}}',
    llegada: 'Arrives {{hora}}',
  },

  // ──────────────────────────────── etiquetas de alertas (lib/alertas.ts)
  alertas: {
    bono: {
      GENERAL: 'No pass / standard',
      BONO_10: 'Bono 10',
      BONO_20: 'Bono 20',
      JUVENIL: 'Youth pass',
      ESTUDIANTE: 'Student',
      DISCAPACIDAD: 'Disability',
      FAMILIA_NUMEROSA: 'Large family',
      MAYOR_60: 'Over 60',
      OTRO: 'Other',
    },
    estado: {
      ACTIVA: 'Active',
      PAUSA: 'Paused',
      COMPLETADA: 'Completed',
    },
    criterio: {
      DISPONIBILIDAD: 'Seats available',
      RETRASO: 'Delay',
      HORARIO: 'Timetable',
      APERTURA_VENTA: 'Sales opening',
      PRECIO: 'Price',
    },
    aviso: 'notice',
    avisos: 'notices',
  },

  // ──────────────────────────────── precios (lib/precios.ts)
  precios: {
    seriePlana: '{{hora}}{{tren}} — {{precio}} ({{resumen}})',
    tren: ' · train {{tren}}',
    sondeosUno: 'no change · {{n}} poll',
    sondeosVarios: 'no change · {{n}} polls',
    ocultosUno: '…and {{n}} earlier poll',
    ocultosVarios: '…and {{n}} earlier polls',
    sinDatos: 'No price data yet',
    sube: 'Up: the minimum was {{minimo}} on {{fecha}}',
    haBajado: 'The price has dropped from {{precio}} → good time',
    estable: 'Price stable for the last {{horas}} h',
  },

  // ──────────────────────────────── próximo viaje (lib/proximoViaje.ts)
  proximo: {
    haSalido: 'has departed',
    menosDeMin: 'less than 1 min left',
    diasHoras: '{{dias}} d {{horas}} h left',
    horasMin: '{{horas}} h {{min}} min left',
    horas: '{{horas}} h left',
    minutos: '{{minutos}} min left',
    hoy: 'Today',
    manana: 'Tomorrow',
    diaNumero: '{{dia}} {{n}}',
    hayPlazasDesde: 'Seats available from {{precio}}',
    sinPlazas: 'No seat data yet',
  },

  // ──────────────────────────────── días de la semana (etiquetas de fecha)
  semana: {
    domingo: 'Sunday',
    lunes: 'Monday',
    martes: 'Tuesday',
    miercoles: 'Wednesday',
    jueves: 'Thursday',
    viernes: 'Friday',
    sabado: 'Saturday',
  },

  // ──────────────────────────────── widget de pantalla de inicio
  widget: {
    titulo: 'NEXT TRAIN',
    proximoViaje: 'Next trip: {{fecha}}',
    sinSalidas: 'No departures today. Open MantiRenfe to refresh your alerts.',
    sinSalidasCorto: 'No departures',
    manana: 'tomorrow',
    accesibilidad: 'Next train, open MantiRenfe',
    plazasDesde: 'Seats from {{precio}}',
    plazasCorto: 'Seats {{precio}}',
    llega: 'Arrives {{hora}}',
    retraso: '+{{min}} min',
    sinDatos: '—',
  },

  // ──────────────────────────────── evento de calendario (.ics)
  ics: {
    aviso: 'Alert: {{ruta}}',
    tren: ' (train {{tren}})',
    alerta: 'MantiRenfe alert: {{ruta}}',
    fecha: 'Date: {{fecha}}',
    franja: 'Window: {{desde}} – {{hasta}}',
    trenLinea: 'Train {{tren}}',
    recordatorio: 'Departure reminder: {{ruta}}',
  },

  // ──────────────────────────────── avisos push (lib/push.ts)
  push: {
    sinFirebase:
      'Push is not available in this build: Firebase (FCM) credentials are missing. Configure them with "npx eas credentials" → Android → Push notifications and rebuild the APK.',
    sinProjectId: 'Missing EAS projectId: run "npx eas-cli init" in apps/mobile',
    soloMovil: 'Push notifications only work on iOS and Android',
    permisoDenegado: 'Notification permission denied',
    canal: 'Train notifications',
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
