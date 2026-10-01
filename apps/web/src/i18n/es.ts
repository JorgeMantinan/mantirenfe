/**
 * Diccionario ES: única fuente de verdad de los textos de la web.
 * El fichero `en.ts` debe tener exactamente el mismo árbol de claves (lo
 * comprueba el tipo `MismoArbol` y, en ejecución, `i18n.test.ts`).
 *
 * Convención: claves en camelCase, un bloque por página/componente, e
 * interpolación i18next con `{{variable}}`.
 */
export const es = {
  // ──────────────────────────────── comunes
  comunes: {
    volverInicio: 'Volver al inicio',
    inicio: 'Inicio',
    crearAlerta: 'Crear alerta',
    transparencia: 'Transparencia',
    cookies: 'Cookies',
    privacidad: 'Privacidad',
    terminos: 'Terminos',
    incidencias: 'Incidencias',
    suprimidos: 'Suprimidos',
    impuntuales: 'Trenes impuntuales',
    cancelar: 'Cancelar',
    eliminar: 'Eliminar',
    error: 'Error',
    todoElDia: 'todo el día',
    logoAria: 'MantiRenfe inicio',
  },

  // ──────────────────────────────── cabecera (Header)
  cabecera: {
    lema: 'Alertas y tiempo real de la red ferroviaria',
    notificaciones: 'Notificaciones',
    miPerfil: 'Mi perfil',
    ajustes: 'Ajustes',
    cerrarSesion: 'Cerrar sesión',
    miCuenta: 'Mi cuenta',
    entrar: 'Entrar',
    registrarse: 'Registrarse',
    modoDemo: 'Modo demo (sin Supabase)',
    tema: 'Tema',
    cambiarTema: 'Cambiar tema',
    temaClaro: 'Claro',
    temaOscuro: 'Oscuro',
    temaSistema: 'Sistema',
    cambiarIdioma: 'Cambiar idioma',
  },

  // ──────────────────────────────── selector de idioma
  selectorIdioma: {
    titulo: 'Idioma',
    es: 'Español',
    en: 'English',
    actual: 'Idioma actual',
  },

  // ──────────────────────────────── menú lateral (Sidebar)
  menu: {
    navegar: 'Navegación principal',
    abrir: 'Abrir menú',
    cerrar: 'Cerrar menú',
    expandir: 'Expandir menú',
    contraer: 'Contraer menú',
    grupoPrincipal: 'Principal',
    grupoExplorar: 'Explorar',
    grupoCuenta: 'Cuenta',
    dashboard: 'Dashboard',
    misAlertas: 'Mis alertas',
    notificaciones: 'Notificaciones',
    mapa: 'Mapa en tiempo real',
    incidencias: 'Incidencias',
    suprimidos: 'Suprimidos',
    buscarTrenes: 'Buscar trenes',
    estaciones: 'Estaciones',
    impuntuales: 'Trenes impuntuales',
    ajustes: 'Ajustes',
    pie: 'Proyecto independiente, no afiliado ni patrocinado por Renfe. Origen de los datos: Renfe Operadora (open data).',
  },

  // ──────────────────────────────── páginas legales (PaginaLegal)
  legal: {
    copyright: '© 2026 MantiRenfe',
  },

  // ──────────────────────────────── cabecera y pie SEO (SeoShell)
  pie: {
    navTrayectos: 'Trayectos',
    navHorarios: 'Buscar horarios',
    navMapa: 'Mapa',
    navEstaciones: 'Estaciones',
    cta: 'Crear alerta',
    afiliacion:
      ' es un proyecto independiente y no está afiliado, patrocinado ni respaldado por Renfe Operadora, Adif ni ningún operador ferroviario.',
    datos: 'Origen de los datos: Renfe Operadora (open data, CC-BY 4.0) · © 2026 MantiRenfe',
    ariaIdioma: 'Idioma',
  },

  // ──────────────────────────────── listado SEO /trayectos
  trayectos: {
    rutaBase: '/trayectos',
    etiqueta: 'Horarios de {{origen}} a {{destino}}',
    h1: 'Horarios de tren por trayectos',
    subtitulo:
      'Elige origen y destino para ver las primeras salidas del día con duración, número de tren y operador. También puedes empezar por uno de los trayectos más buscados.',
    buscadorTitulo: 'Tu trayecto',
    buscadorDescripcion: 'Consulta sin cuenta. Las alertas de disponibilidad requieren registro.',
    etiquetaOrigen: 'Origen',
    etiquetaDestino: 'Destino',
    botonBuscar: 'Ver horarios',
    popularesTitulo: 'Trayectos populares',
    popularesDescripcion:
      'Los {{total}} trayectos más buscados de la red, con las primeras salidas de hoy y el detalle de cada tren. Si el tuyo no está, búscalo en el formulario de arriba.',
  },

  // ──────────────────────────────── detalle SEO /trayectos/:o/:d
  trayecto: {
    rutaBase: '/trayectos',
    migasTrayectos: 'Trayectos',
    migasAria: 'Migas de pan',
    h1: 'Horarios de {{origen}} a {{destino}}',
    subtitulo:
      'Programa de {{fecha}}: primeras salidas con hora de llegada, duración, número de tren y operador.',
    sinEstacionTitulo: 'No encontramos esa estación',
    sinEstacionDescripcion:
      'No encontramos ninguna estación que encaje con {{faltantes}}. Elige la que buscas y te llevamos a su página de horarios.',
    faltanteUnion: ' y ',
    etiquetaOrigen: 'Origen',
    etiquetaDestino: 'Destino',
    columnaSalida: 'Salida',
    columnaLlegada: 'Llegada',
    columnaDuracion: 'Duración',
    columnaTren: 'Tren',
    columnaOperador: 'Operador',
    sinResultadosAntes: 'Sin resultados para hoy: no hay trenes programados de ',
    sinResultadosEntre: ' a ',
    sinResultadosDespues:
      ' (ni directos ni con transbordo). Prueba con otro día o divide el viaje en dos tramos.',
    sinDirectos:
      'Hoy no hay trenes directos de {{origen}} a {{destino}}: todas las opciones con transbordo aparecen marcadas.',
    transbordoEn: 'Transbordo en {{estacion}}',
    espera: 'espera {{minutos}} min',
    tarjetaTitulo: 'Primeras salidas de hoy',
    tarjetaDescripcion:
      '{{directas}} directas · {{conTransbordo}} con transbordo · fuente: {{fuente}} · primeras {{limite}} salidas del día',
    ctaTitulo: '¿Viajas a menudo de {{origen}} a {{destino}}?',
    ctaTexto: 'Te avisamos cuando se libere plaza, cambie el horario o el tren vaya con retraso.',
    ctaBoton: 'Crea una alerta para este trayecto',
    datosTitulo: 'Datos',
    datosOrigen: 'Origen de los datos: Renfe Operadora (open data).',
    datosOrigenFuente:
      'Origen de los datos: Renfe Operadora (open data) · fuente de la respuesta: {{fuente}}.',
    datosIndependiente: 'Proyecto independiente, no afiliado ni patrocinado por Renfe.',
    otrosTitulo: 'Otros trayectos populares',
    otrosDescripcion:
      'Horarios de los trayectos más buscados en España, con las primeras salidas del día.',
    errorCarga: 'No se pudieron cargar los horarios',
  },

  // ──────────────────────────────── meta tags SEO
  meta: {
    baseTitulo: 'MantiRenfe - No pierdas tu asiento',
    baseDescripcion:
      'MantiRenfe: alertas de disponibilidad, horarios y trenes en tiempo real de la red Renfe',
    trayectoTitulo: 'Horarios de {{origen}} a {{destino}} {{anio}} | MantiRenfe',
    trayectoDescripcion:
      'Horarios de {{origen}} a {{destino}} hoy: primeras salidas, llegada, duración, tren y operador con datos abiertos de Renfe. Crea una alerta para este trayecto.',
    trayectosTitulo: 'Horarios de tren por trayectos de España | MantiRenfe',
    trayectosDescripcion:
      'Busca horarios de tren entre dos estaciones: primeras salidas del día, duración, tren y operador con datos abiertos de Renfe. Trayectos populares y alertas personalizadas.',
  },

  // ──────────────────────────────── formulario / campos comunes
  form: {
    email: 'Email',
    emailPlaceholder: 'tu@email.com',
    contrasena: 'Contraseña',
    fecha: 'Fecha',
  },

  // ──────────────────────────────── cabeceras de tabla reutilizables
  tabla: {
    salida: 'Salida',
    llegada: 'Llegada',
    destino: 'Destino',
    tren: 'Tren',
    operador: 'Operador',
    duracion: 'Duración',
  },

  // ──────────────────────────────── estados compartidos de tren/plaza
  estados: {
    cancelado: 'Cancelado',
    hayPlazas: 'Hay plazas',
    hayPlazasDesde: 'Hay plazas desde {{precio}}',
    completo: 'Completo',
    sinDatosPlazas: 'Sin datos de plazas aún',
    aTiempo: 'A tiempo',
    retraso: 'Retraso +{{min}} min',
  },

  // ──────────────────────────────── bloque de billetes (BloqueBilletes)
  billetes: {
    titulo: 'Busca tu billete',
    enlace: 'Busca tu billete en {{nombre}}',
    aviso: 'Enlaces de afiliación: podemos recibir una comisión sin coste extra para ti.',
    transparencia: 'Cómo se financia MantiRenfe',
  },

  // ──────────────────────────────── landing
  landing: {
    navCaracteristicas: 'Características',
    navComoFunciona: 'Cómo funciona',
    navMapa: 'Mapa',
    botonMiPanel: 'Mi panel',
    botonEmpezar: 'Empezar gratis',
    botonVerMapa: 'Ver el mapa',
    heroBadge: 'Alertas inteligentes para viajeros',
    heroTituloAntes: 'No pierdas tu asiento.',
    heroTituloFuerte: 'Vigilamos los trenes',
    heroTituloDespues: ' por ti.',
    heroTexto:
      '¿Compraste el de las 19:00 porque el de las 17:00 estaba completo? MantiRenfe te avisa en cuanto se libere una plaza para que cambies de billete a tiempo. Además: mapa en tiempo real, cuenta atrás a tu salida y avisos según tu bono.',
    heroCtaPrimera: 'Crear mi primera alerta',
    heroCtaHorarios: 'Buscar horarios',
    heroPwa: 'Instalable como app en Android e iPhone (PWA). Sin instalar nada extra.',
    demoTrayecto: 'Madrid-Atocha → Sevilla',
    demoPlaza: 'Plaza libre',
    demoTren: 'Tren de las 17:00',
    demoAsientos: '0 asientos → 1 libre',
    demoDetalles: 'AVLO 02174 · Turista',
    demoAviso: 'Aviso enviado',
    demoAvisoTexto: 'a las 13:20 — cancela tu billete de las 19:00.',
    caracteristicasTitulo: 'Todo lo que necesitas antes de subirte al tren',
    caracteristicasTexto:
      'Hecho para quien compra y cancela billetes, comparte trayecto y quiere llegar justo a la hora.',
    caracteristicas: {
      alertasTitulo: 'Alertas de disponibilidad',
      alertasTexto:
        'Compraste el de las 19:00 y aparece plaza en el de las 17:00. Te avisamos en cuanto cambie.',
      mapaTitulo: 'Mapa en tiempo real',
      mapaTexto: 'Sigue la posición de los trenes de Cercanías y Larga Distancia sobre el mapa.',
      cuentaTitulo: 'Cuenta atrás a tu salida',
      cuentaTexto:
        '«Te faltan 50 minutos»: recordatorios personalizables antes de que salga tu tren.',
      perfilTitulo: 'Avisos según tu perfil',
      perfilTexto:
        'Bono, joven, estudiante, discapacidad, familia numerosa… filtramos lo que te afecta a ti.',
      multiTitulo: 'Multioperador',
      multiTexto: 'Renfe, Avlo, Ouigo e Iryo en un solo sitio, sin saltar entre webs.',
      invitadoTitulo: 'Modo invitado',
      invitadoTexto: 'Busca horarios y consulta el mapa sin cuenta. Las alertas requieren login.',
    },
    pasos: {
      unoTitulo: '1. Cuéntanos tu viaje',
      unoTexto: 'Origen, destino, fecha y franja horaria. Tu bono y tipo de tren.',
      dosTitulo: '2. Vigilamos por ti',
      dosTexto:
        'Nuestro worker sondea la disponibilidad cada pocos minutos con backoff y reintentos.',
      tresTitulo: '3. Recibe el aviso',
      tresTexto: 'Notificación push al móvil o al navegador en el momento en que hay plaza.',
    },
    trayectosTitulo: 'Trayectos populares',
    trayectosTexto:
      'Mira las primeras salidas de hoy de los trayectos más buscados de España, con duración, número de tren y operador de cada servicio. En cada página encuentras la tabla del día y un botón para crear una alerta sobre ese trayecto.',
    verTodos: 'Ver todos los trayectos →',
    inglesTitulo: 'Trains in English / For visitors',
    inglesTexto:
      'Visiting Spain and prefer English? These route timetables are published in English with the same data: first departures, arrival time, duration, train number and operator.',
    inglesEnlace: 'All train schedules in English →',
    finalTitulo: '¿Listo para no perder tu tren?',
    botonCuentaGratis: 'Crear cuenta gratis',
    apoya: 'Apoya el proyecto',
    donaciones: 'Las donaciones sostienen el proyecto independiente.',
  },

  // ──────────────────────────────── acceso (login / registro / reset / callback)
  login: {
    titulo: 'Inicia sesión',
    descripcion: 'Accede a tus alertas y notificaciones',
    configAntes: 'Falta configurar ',
    configEntre: ' y ',
    configMedio: ' en el archivo ',
    configDespues:
      '. Crea el proyecto en Supabase y habilita los proveedores Google / Microsoft en Authentication → Providers.',
    google: 'Continuar con Google',
    microsoft: 'Continuar con Outlook / Microsoft',
    oEmail: 'o con email',
    enviando: 'Entrando...',
    entrar: 'Iniciar sesión',
    olvidaste: '¿Olvidaste tu contraseña?',
    sinCuenta: '¿Aún no tienes cuenta?',
    registrate: 'Regístrate',
    errorCampos: 'Introduce email y contraseña',
    bienvenido: '¡Bienvenido de nuevo!',
    errorGenerico: 'No se pudo iniciar sesión',
    errorProveedor: 'Error con el proveedor',
  },

  registro: {
    titulo: 'Crea tu cuenta',
    descripcion: 'Alertas personalizadas en menos de un minuto',
    configAntes: 'Configura Supabase en ',
    configDespues: ' para habilitar el registro.',
    google: 'Registrarme con Google',
    microsoft: 'Registrarme con Outlook',
    nombre: 'Nombre',
    nombrePlaceholder: 'Ana Viajera',
    repetir: 'Repetir contraseña',
    creando: 'Creando cuenta...',
    crear: 'Crear cuenta',
    yaCuenta: '¿Ya tienes cuenta?',
    iniciaSesion: 'Inicia sesión',
    errorCampos: 'Nombre y email son obligatorios',
    errorPassword: 'La contraseña debe tener al menos 8 caracteres',
    errorIguales: 'Las contraseñas no coinciden',
    creadaConfirmar: 'Cuenta creada. Revisa tu email para confirmar el acceso.',
    creada: '¡Cuenta creada! Ya estás dentro.',
    errorGenerico: 'No se pudo crear la cuenta',
  },

  reset: {
    tituloEnlace: 'Recuperar contraseña',
    tituloNueva: 'Elige una contraseña nueva',
    descNueva: 'Esta es tu nueva contraseña de acceso',
    descEnlace: 'Te enviaremos un enlace para crear una nueva',
    nueva: 'Nueva contraseña',
    guardando: 'Guardando...',
    guardar: 'Guardar contraseña',
    enviando: 'Enviando...',
    enviar: 'Enviar enlace de recuperación',
    volverLogin: '← Volver a iniciar sesión',
    noConfig: 'Autenticación no configurada',
    errorEmail: 'Introduce tu email',
    enviadoOk:
      'Si existe una cuenta con ese email, te hemos enviado un enlace para cambiar la contraseña.',
    errorEnvio: 'No se pudo enviar',
    okPassword: 'Contraseña actualizada. Ya puedes entrar.',
    errorActualizar: 'No se pudo actualizar',
  },

  callback: {
    texto: 'Completando inicio de sesión…',
  },

  noEncontrado: {
    titulo: 'Estación no encontrada',
    texto: 'La página que buscas no existe o ha cambiado de andén.',
  },

  // ──────────────────────────────── página de transparencia
  transparencia: {
    entradilla: 'Qué es MantiRenfe, de dónde vienen los datos y cómo se financia el proyecto.',
    quienesTitulo: 'Quiénes somos',
    quienes1:
      '<strong>MantiRenfe</strong> es un proyecto independiente, sin ánimo de lucro de persona o equipo particular. No estamos afiliados, patrocinados, respaldados ni gestionados por Renfe Operadora, Adif, Ouigo, Iryo ni ningún otro operador ferroviario.',
    quienes2:
      '<strong>No somos un sitio oficial de Renfe</strong> ni sustituimos a venta.renfe.com: te ayudamos a vigilar disponibilidad, horarios y estado de la red, pero la compra de billetes se hace siempre en la web o app de cada operador.',
    financiaTitulo: 'Cómo se financia',
    financiaIntro: 'El proyecto no cobra a sus usuarios. Sus vías de financiación son estas dos:',
    financiaAfiliacion:
      '<strong>Enlaces de afiliación</strong>: cuando se muestran, van a servicios de compra de billetes externos. Si compras a través de ellos, podemos recibir una comisión <em>sin coste extra para ti</em>. No condicionan los resultados que mostramos: los horarios, precios y avisos salen de los datos de Renfe, no de quién paga.',
    financiaDonaciones:
      '<strong>Donaciones</strong>: aportaciones voluntarias (cuando el canal está abierto) para cubrir servidores, dominio y horas de mantenimiento. Las donaciones sostienen el proyecto independiente.',
    estadoTitulo: 'Estado actual de la monetización:',
    afiliacionActiva: 'Enlaces de afiliación activos: {{nombres}}.',
    afiliacionSin: 'Sin enlaces de afiliación activos por ahora.',
    donacionesAbierta: 'Canal de donaciones abierto desde el pie de la landing.',
    donacionesCerrada: 'Sin canal de donaciones abierto por ahora.',
    sinPublicidad: 'Sin publicidad de terceros, sin venta de datos y sin patrocinios.',
    fuentesTitulo: 'Fuentes de datos',
    fuentes1:
      '<strong>Origen de los datos: Renfe Operadora</strong> a través de su programación abierta (open data): ficheros GTFS estáticos de horarios y estaciones, y feeds GTFS-Realtime de posiciones, retrasos e incidencias, publicados bajo licencia CC-BY 4.0.',
    fuentes2:
      'Nuestro worker sincroniza esos ficheros de forma periódica para mantener los horarios y las posiciones al día. Los datos de disponibilidad de asientos proceden de la venta de Renfe cuando están disponibles.',
    fuentes3:
      'Las marcas «Renfe», «Adif», «Ouigo» e «Iryo» pertenecen a sus respectivos titulares y se citan solo con fines informativos.',
  },

  // ──────────────────────────────── política de cookies
  cookies: {
    titulo: 'Política de cookies',
    entradilla: 'Qué almacenamos en tu navegador, para qué y cómo puedes controlarlo.',
    s1Titulo: 'Qué son cookies y almacenamiento local',
    s1Texto:
      'Las cookies son pequeños archivos que un sitio guarda en tu navegador. El almacenamiento local (localStorage) hace lo mismo pero sin enviarlo con cada petición. Ambos sirven para recordar cosas entre visitas: tu sesión, tu tema, tus preferencias.',
    s2Titulo: 'Qué usa esta versión',
    s2Intro: 'Guardamos lo necesario para que la app funcione:',
    liSesion:
      '<strong>Sesión de usuario</strong>: Supabase Auth guarda tu sesión en localStorage (clave <code>sb-…-auth-token</code>) para que no tengas que iniciar sesión en cada visita. Se borra al cerrar sesión.',
    liTema:
      '<strong>Tema</strong>: la preferencia de claro, oscuro o sistema se guarda en localStorage para respetarla la próxima vez que entres.',
    liPreferencias:
      '<strong>Preferencias y notificaciones</strong>: la suscripción a avisos push y los ajustes de alertas se asocian a tu cuenta en nuestro servidor.',
    liCache:
      '<strong>Caché de la PWA</strong>: el service worker guarda los recursos de la app en Cache Storage para que abra rápido y, si proceda, funcione sin conexión.',
    liAds:
      '<strong>Publicidad (Google AdSense)</strong>: en las páginas de trayecto mostramos anuncios de Google AdSense. Google y sus socios pueden instalar cookies y usar identificadores de dispositivo solo <em>después</em> de tu consentimiento (para visitantes de la EEE, Reino Unido y Suiza). Ese consentimiento se recoge con el banner de la CMP de Google al entrar: <em>Consentir · No consentir · Gestionar opciones</em>. Si eliges <em>No consentir</em>, los anuncios se muestran de forma no personalizada.',
    liAnalitica:
      '<strong>No usamos analítica externa propia</strong> (ni Google Analytics ni similares): solo lo necesario para que la app funcione, tal como describe la lista de arriba.',
    s3Titulo: 'Consentimiento, anunciantes y afiliados',
    s3p1: 'El banner de consentimiento (CMP de Google) aparece en tu primera visita y permite aceptar, rechazar o ajustar los fines en cualquier momento desde <strong>«Gestionar opciones»</strong>, que Google añade en la propia página mientras la CMP esté activa. Retirar el consentimiento afecta a partir de esa misma sesión.',
    s3p2: 'Los enlaces de afiliación, cuando existan, abren webs de terceros (Trainline, Omio…) que aplican sus propias cookies bajo sus políticas, no las nuestras; se identifican siempre como enlace de afiliación.',
    s4Titulo: 'Cómo controlar o borrar lo guardado',
    s4Texto:
      'Puedes borrar el almacenamiento de MantiRenfe desde la configuración de tu navegador (Borrar datos de navegación → Cookies y datos de sitios web, o datos guardados de aplicaciones). También puedes bloquear cookies y localStorage por sitio; si lo haces, la sesión y el tema recordado dejarán de funcionar hasta que vuelvas a iniciar sesión.',
  },

  // Politica de privacidad (Google OAuth exige enlace)
  privacidad: {
    titulo: 'Política de privacidad',
    entradilla: 'Qué datos personales tratamos, con qué finalidad y qué derechos tienes.',
    s1Titulo: 'Responsable y contacto',
    s1Texto:
      'Jorge Mantiñán es el responsable del tratamiento de los datos de esta aplicación. Para cualquier consulta o ejercicio de derechos, escribe a jorgemantinanmontero@gmail.com.',
    s2Titulo: 'Qué datos tratamos',
    liCuenta:
      '<strong>Cuenta</strong>: email y nombre que proporcionas al registrarte (Supabase Auth).',
    liAlertas:
      '<strong>Alertas y avisos</strong>: trayectos vigilados, preferencias (tema, idioma, notificaciones) y el historial de avisos enviados, asociados a tu cuenta.',
    liTecnico:
      '<strong>Datos técnicos</strong>: tokens de notificaciones push de tu dispositivo y almacenamiento local (sesión, tema, idioma) en tu navegador o app.',
    liEmail:
      '<strong>Correos</strong>: si activas los avisos por email, usamos tu dirección exclusivamente para enviarte los avisos que hayas solicitado.',
    s3Titulo: 'Finalidad y base legal',
    s3Texto:
      'Tratamos tus datos para prestar el servicio que solicitaste (alertas de trenes y avisos), con tu consentimiento al registrarte y activar las notificaciones. No elaboramos perfiles ni usamos tus datos con fines publicitarios propios.',
    s4Titulo: 'Terceros con los que trabajamos',
    liTerceros:
      '<strong>Supabase</strong> (autenticación y base de datos), <strong>Render</strong> (API y workers), <strong>Vercel</strong> (web), <strong>Expo/Google</strong> (notificaciones push), <strong>GitHub</strong> (integración continua) y <strong>Google AdSense</strong> (publicidad, solo con tu consentimiento — ver la política de cookies).',
    liRenfe:
      '<strong>Datos ferroviarios</strong> proceden de Renfe Operadora en régimen de open data (reutilización comercial permitida); no estamos afiliados ni patrocinados por Renfe.',
    s5Titulo: 'Conservación y derechos',
    s5Texto:
      'Conservamos los datos mientras tu cuenta esté activa; puedes eliminarlos en cualquier momento cerrando la cuenta o escribiendo a nuestro correo. Tienes derecho de acceso, rectificación, supresión, oposición y portabilidad conforme al RGPD (UE) 2016/679 y la LOPDGDD.',
  },

  // Terminos del servicio (Google OAuth)
  terminos: {
    titulo: 'Condiciones del servicio',
    entradilla: 'Reglas básicas de uso de MantiRenfe.',
    s1Titulo: 'Uso del servicio',
    s1Texto:
      'MantiRenfe es un proyecto independiente de uso personal: puedes crear alertas, consultar horarios y recibir avisos. No garantizamos la disponibilidad continua de los datos ni su exactitud: provienen de fuentes públicas de Renfe Operadora que pueden actualizarse o interrumpirse.',
    s2Titulo: 'Cuentas y usos abusivos',
    s2Texto:
      'Eres responsable de tu cuenta. Quedan prohibidos el uso automatizado intensivo (scraping de la plataforma), la suplantación y cualquier uso que perjudique al servicio. Podemos suspender cuentas que incumplan estas condiciones.',
    s3Titulo: 'Propiedad intelectual',
    s3Texto:
      '<strong>El software de MantiRenfe es de su autor.</strong> Los datos ferroviarios pertenecen a Renfe Operadora (open data con atribución obligatoria) y las marcas "Renfe", "Ouigo" o "Iryo" a sus titulares; su uso es meramente informativo sin sugerir patrocinio.',
    s4Titulo: 'Limitación de responsabilidad',
    s4Texto:
      'El servicio se presta "tal cual": no respondemos de decisiones tomadas en base a los avisos (incluidas compras de billetes), ni de interrupciones derivadas de las fuentes de datos. Estas condiciones pueden actualizarse; el uso continuado implica su aceptación.',
  },

  // ──────────────────────────────── página de incidencias
  incidencias: {
    titulo: 'Incidencias de servicio',
    subtitulo:
      'Avisos y incidencias de cercanías publicados por Renfe en tiempo real, actualizados cada minuto',
    vacio:
      'No hay incidencias activas ahora mismo. Si aparece alguna, la verás aquí en cuanto el feed de Renfe la publique.',
    sinEstacion: 'Afecta a líneas del servicio, sin estación concreta indicada',
    tituloFallback: 'Incidencia de servicio',
    periodoDesde: 'Desde el {{fecha}}',
    periodoHasta: 'Hasta el {{fecha}}',
    periodoSin: 'Periodo no indicado',
  },

  // ──────────────────────────────── página de puntualidad
  puntualidad: {
    titulo: 'Trenes más impuntuales',
    subtitulo:
      'Ranking mensual de trayectos (origen → destino) con retrasos de 5 minutos o más, medido con los datos en vivo de Renfe',
    mes: 'Mes',
    ordenVeces: 'Más veces impuntuales',
    ordenMedia: 'Mayor impuntualidad media',
    vacio:
      'Aún no hay datos de impuntualidad para este mes. Vuelve dentro de un rato: medimos los retrasos en tiempo real mientras el mapa y las alertas están en marcha.',
    descripcion:
      'Servicios impuntuales = viajes de un mismo trayecto (origen → destino) que llegaron con 5+ minutos de retraso',
    colTren: 'Tren',
    colTrayecto: 'Trayecto',
    colSalida: 'Salida',
    colLlegada: 'Llegada',
    colLlegadaEstimada: 'Llegada estimada',
    colServicios: 'Servicios impuntuales',
    colRetrasoMedio: 'Retraso medio',
    colPeorRetraso: 'Peor retraso',
    nota: 'Llegada estimada = llegada programada + peor retraso registrado en el mes: es una estimación orientativa, no una hora oficial.',
  },

  // ──────────────────────────────── página de suprimidos
  suprimidos: {
    titulo: 'Trenes suprimidos',
    subtitulo: 'Cancelaciones detectadas en el feed GTFS-RT de Renfe, actualizadas cada 5 minutos',
    consultar: 'Consultar',
    consultarDescripcion: 'Sin cuenta. Solo conservamos los últimos {{dias}} días de detecciones.',
    estacionLabel: 'Estación (opcional)',
    fechaLabel: 'Fecha',
    buscar: 'Buscar',
    quitarFiltro: 'Quitar filtro de {{estacion}}',
    resultados: 'Resultados',
    resultadosDesc: '{{trenes}} trenes suprimidos · {{fecha}}',
    resultadosDescEstacion: '{{trenes}} trenes suprimidos · {{fecha}} · {{estacion}}',
    sinTrenes: 'Sin trenes suprimidos para esa fecha/estación',
    nadaReportar:
      'Nada que reportar: no hay trenes suprimidos registrados para el <strong>{{fecha}}</strong>.',
    nadaReportarEstacion:
      'Nada que reportar: no hay trenes suprimidos registrados para el <strong>{{fecha}}</strong> que pasen por <strong>{{estacion}}</strong>.',
    notaAntes:
      'La detección cubre Larga Distancia; Cercanías cancela rara vez en el feed. Si esperabas una supresión, revisa también las ',
    notaBoton: 'incidencias de servicio',
    notaDespues: '.',
    colTren: 'Tren',
    colOrigenDestino: 'Origen → Destino',
    colSalida: 'Salida',
    colLlegada: 'Llegada',
    colDatos: 'Datos',
    sinDatos: 'Sin datos',
    error: 'Error al consultar los trenes suprimidos',
  },

  // ──────────────────────────────── página de trenes (búsqueda de horarios)
  trenes: {
    titulo: 'Buscar trenes',
    subtitulo:
      'Horarios programados entre estaciones (GTFS de Renfe y de los demás operadores sincronizados)',
    buscadorTitulo: 'Tu trayecto',
    buscadorDescripcion: 'Consulta sin cuenta. Las alertas sí requieren login.',
    origenLabel: 'Origen',
    destinoLabel: 'Destino',
    botonBuscar: 'Buscar horarios',
    buscando: 'Buscando...',
    resultados: 'Resultados',
    resultadosDesc: '{{trenes}} trenes · fuente: {{fuente}}',
    sinEstacion: 'Estación no encontrada',
    estacionIndicada: 'indicada',
    sinTrenes: 'Sin trenes directos ni con conexión para esa fecha',
    desde: 'Desde',
    hasta: 'Hasta',
    mostrando: 'Mostrando {{visibles}} de {{total}} salidas',
    limpiar: 'Limpiar',
    compara: 'Compara operadores: {{lista}}',
    avisoAlertas:
      'Las alertas cubren solo lo que su criterio alcance: disponibilidad y retraso se miden con datos de Renfe, y el horario con este mismo GTFS.',
    avisoOuigo:
      ' Por eso un tren de Ouigo no se vigila con una alerta de disponibilidad. Datos de Ouigo: NAP del Ministerio — ',
    avisoOuigoEnlace: 'Powered by MITRAMS',
    sinEstacionTexto:
      'No encontramos la estación <strong>{{estaciones}}</strong>. Revisa el nombre (tildes, «La Coruña» = «A Coruña») o elige una sugerencia al escribir.',
    notaEstacionesAntes: 'Si no aparece, prueba a buscarla en ',
    notaEstacionesBoton: 'estaciones',
    sinTrenesTexto:
      'Sin trenes directos ni con conexión de <strong>{{origen}}</strong> a <strong>{{destino}}</strong> para el <strong>{{fecha}}</strong>. Prueba con otra fecha o divide el viaje en dos tramos.',
    crearAlerta: 'Crear alerta de disponibilidad',
    teAvisamos: 'Te avisamos cuando Renfe abra plazas para esa ruta y fecha.',
    ningunoFranja: 'Ninguna salida en esa franja',
    limpiarFiltro: 'Limpiar filtro',
    transbordoDetalle:
      '{{tren1}} llega a las {{llegada1}} · espera {{minutos}} min · {{tren2}} sale a las {{salida2}}',
    alerta: 'Alerta',
    errorBusqueda: 'Error en la búsqueda',
  },

  // ──────────────────────────────── página de estaciones
  estaciones: {
    subtitulo:
      'Busca por nombre o por ciudad/zona —prueba «Vigo»— para ver las salidas de hoy, las incidencias que afectan a esa estación y su situación en el mapa.',
    buscarTitulo: 'Buscar estación',
    buscarDescripcion:
      'El buscador tolera tildes y abreviaturas: con «Vigo» aparecen todas las estaciones de la ciudad.',
    estacionLabel: 'Estación',
    placeholder: 'Vigo-Guixar, Madrid-Atocha, Valencia...',
    ayuda:
      'Escribe al menos 2 letras. Si no la encuentras, prueba con la ciudad, la comarca o la provincia.',
    codigo: 'Código {{codigo}}',
    badgeEstacion: 'Estación {{codigo}}',
    incidenciaActiva: '1 incidencia activa',
    incidenciasActivas: '{{n}} incidencias activas',
    sinIncidencias: 'Sin incidencias',
    verEnMapaBoton: 'Ver en el mapa',
    cargandoOficiales: 'Cargando datos oficiales...',
    direccion: 'Dirección',
    cp: 'CP',
    poblacion: 'Población',
    provincia: 'Provincia',
    verEnMapa: 'Ver en mapa',
    aforoTitulo: 'Datos históricos de aforo (2018)',
    aforoBadge: 'histórico 2018',
    franja: 'Franja',
    viajeros: 'Viajeros',
    aforoNota:
      'Viajeros subidos y bajados por franja horaria — fuente: data.renfe.com («Volumen de Viajeros por Franja Horaria», 2018).',
    estacionesList: 'Estaciones: {{lista}}',
    salidasTitulo: 'Salidas de hoy',
    salidasDesde: ' · salidas programadas desde {{estacion}}',
    actualizar: 'Actualizar',
    actualizarSalidas: 'Actualizar salidas',
    sinSalidas: 'Sin salidas hoy',
  },

  // ──────────────────────────────── página del mapa
  mapa: {
    titulo: 'Mapa en tiempo real',
    subtitulo: 'Posiciones GTFS-RT de Cercanías y Larga Distancia · actualización cada 30 s',
    placeholder: 'Filtrar trenes...',
    filtrarAria: 'Filtrar trenes del mapa',
    recuentoFiltrado: '{{visibles}} / {{total}} trenes',
    recuento: '{{total}} trenes',
    actualizar: 'Actualizar',
    errorApiAntes: ' — comprueba la API o la URL de GTFS-RT en ',
    errorApiDespues: '.',
    sinCoincidencias: 'Ningún tren coincide con «{{filtro}}». Borra el filtro para verlos todos.',
    redTitulo: 'Red ferroviaria',
    redDatos: 'Datos: Renfe Operadora (open data CC-BY 4.0) · Cartografía © OpenStreetMap',
    tren: 'Tren',
    salida: 'Salida {{hora}}',
    llegada: ' · Llegada {{hora}}',
    compromiso: 'Compromiso de Renfe: {{texto}}',
    actualizado: 'Actualizado {{hora}}',
    cargando: 'Cargando...',
    ocultarTraza: 'Ocultar traza',
    verTraza: 'Ver traza (24 h)',
    soloPunto: 'Solo 1 punto registrado (muestreo cada 10 min) — vuelve a pulsar en un rato.',
    errorCarga: 'No se pudieron cargar las posiciones',
    pie: 'Compromiso de Puntualidad de Renfe (fuente: renfe.com, consulta 27/09/2026) · solo informativo: el porcentaje de devolución real depende del tipo de servicio y de las exclusiones aplicables.',
  },

  // ──────────────────────────────── cuenta atrás y estados del dashboard
  viaje: {
    hoy: 'Hoy',
    manana: 'Mañana',
    haSalido: 'ha salido',
    cuentaMenosDeUno: 'faltan menos de 1 min',
    cuentaDias: 'faltan {{dias}} d {{horas}} h',
    cuentaHoras: 'faltan {{horas}} h',
    cuentaHorasMin: 'faltan {{horas}} h {{min}} min',
    cuentaMinutos: 'faltan {{min}} min',
  },

  // ──────────────────────────────── histórico de precios (detalle de alerta)
  precios: {
    serieTren: ' · tren {{tren}}',
    serieResumen: '(sin cambios · {{n}} sondeo{{plural}})',
    sondeosOcultos1: '…y 1 sondeo anterior',
    sondeosOcultosN: '…y {{n}} sondeos anteriores',
    sinDatos: 'Sin datos de precio todavía',
    sube: 'Sube: el mínimo fue {{precio}} el {{fecha}}',
    haBajado: 'El precio ha bajado desde {{precio}} → buen momento',
    estable: 'Precio estable en las últimas {{horas}} h',
  },

  // ──────────────────────────────── fichero .ics del calendario
  ics: {
    aviso: 'Aviso: {{ruta}}',
    tren: ' (tren {{tren}})',
    alerta: 'Alerta de MantiRenfe: {{ruta}}',
    fecha: 'Fecha: {{fecha}}',
    franja: 'Franja: {{desde}} – {{hasta}}',
    trenLinea: 'Tren {{tren}}',
    recordatorio: 'Recordatorio de salida: {{ruta}}',
  },

  // ──────────────────────────────── errores genéricos de la web
  errores: {
    sinSesion: 'No hay sesión activa: inicia sesión de nuevo',
    status: 'Error {{status}}',
    authNoConfig: 'Autenticación no configurada (VITE_SUPABASE_URL)',
  },

  // ──────────────────────────────── dashboard
  dashboard: {
    titulo: 'Dashboard',
    saludo: 'Hola{{nombre}} — resumen de tus trenes',
    nuevaAlerta: 'Nueva alerta',
    alertasActivas: 'Alertas activas',
    avisosSinLeer: 'Avisos sin leer',
    totalAlertas: 'Total alertas',
    ultimosAvisos: 'Últimos avisos',
    ultimosAvisosDesc: 'Notificaciones de disponibilidad y cambios',
    sinAvisos: 'Todavía no hay avisos. Cuando haya plaza te avisaremos aquí y por push.',
    misAlertasDesc: 'Trayectos que estamos vigilando',
    sinAlertas: 'Crea tu primera alerta y deja que vigilemos tu tren.',
    errorPanel: 'No se pudo cargar el panel: {{error}}',
    estadoHecha: 'Hecha',
    proximoViaje: 'Tu próximo viaje',
    sinSalidasTitulo: 'Aún no hay ninguna salida en camino',
    sinAlertasTexto:
      'Crea tu primera alerta y aquí verás tu próxima salida con la cuenta atrás y las plazas del tren.',
    sinSalidasTexto:
      'Ahora mismo no hay ninguna salida en camino: en cuanto tu alerta tenga un tren con fecha, aparecerá aquí con la cuenta atrás.',
    horaPorConfirmar: 'hora por confirmar',
    trenNumero: 'tren {{numero}}',
    sinDatosPlazas: 'Aún no sabemos las plazas: comprobamos cada {{min}} min',
    verAlerta: 'Ver alerta',
    // ──────────────────────────────── «Tu actividad» (historial + estadísticas)
    actividadTitulo: 'Tu actividad ({{dias}} días)',
    actividadDesglose: 'Avisos por tipo',
    actividadAviso1: '1 aviso',
    actividadAvisosN: '{{n}} avisos',
    actividadActiva1: '1 alerta activa',
    actividadActivasN: '{{n}} alertas activas',
    actividadCompletada1: '1 completada',
    actividadCompletadasN: '{{n}} completadas',
    actividadTipoAlertas: 'Plazas, horarios y retrasos',
    actividadTipoCancelacion: 'Cancelaciones',
    actividadTipoParadaSuprimida: 'Paradas suprimidas',
    actividadTipoIncidencia: 'Incidencias',
    actividadTipoRecordatorio: 'Recordatorios de salida',
    actividadTipoResumenViaje: 'Resúmenes de viaje',
    actividadTipoPrecio: 'Avisos de precio',
    actividadTipoDigest: 'Resumen diario por email',
    actividadTipoSemanal: 'Resumen semanal',
    actividadTipoOtro: 'Otros',
  },

  // ──────────────────────────────── listado de alertas
  alertas: {
    subtitulo: 'Trayectos vigilados y su estado de sondeo',
    filtroTodas: 'Todas',
    filtroActivas: 'Activas',
    filtroPausa: 'En pausa',
    filtroCompletadas: 'Completadas',
    estadoActiva: 'Activa',
    estadoPausa: 'En pausa',
    completada: 'Completada',
    recurrenteLaborables: 'L-V: Cada día laborable',
    aviso1: '1 aviso',
    avisosN: '{{n}} avisos',
    avisosTitulo: 'Avisos recibidos por esta alerta',
    pausar: 'Pausar',
    reanudar: 'Reanudar',
    editar: 'Editar',
    avisos: 'Avisos',
    eliminarAria: 'Eliminar alerta',
    sinAlertasTitulo: 'Aún no tienes alertas',
    sinAlertasTexto: 'Crea una para tu próximo viaje y te avisaremos si se libera plaza.',
    crearPrimera: 'Crear la primera',
    sinEstado: 'No hay alertas con ese estado.',
    desdeHora: 'desde {{hora}}',
    cadaMin: 'cada {{min}} min',
    bono: 'bono {{bono}}',
    ultimoSondeo: 'Último sondeo: {{fecha}}',
    toastReanudada: 'Alerta reanudada',
    toastPausa: 'Alerta en pausa',
    toastNoActualizar: 'No se pudo actualizar',
    toastEliminada: 'Alerta eliminada',
    toastNoEliminar: 'No se pudo eliminar',
    dialogoTitulo: '¿Eliminar esta alerta?',
    dialogoTexto:
      'Se dejará de vigilar {{origen}} → {{destino}} el {{fecha}}. Esta acción no se puede deshacer.',
  },

  // ──────────────────────────────── alta/edición de alertas
  nuevaAlerta: {
    volver: 'Volver',
    editarTitulo: 'Editar alerta',
    nuevaTitulo: 'Nueva alerta',
    editarSub: 'Modifica cualquier dato; reiniciaremos los avisos si cambia la ruta',
    nuevaSub: 'Te avisaremos cuando cambie la disponibilidad de este trayecto',
    trayectoTitulo: 'Trayecto a vigilar',
    trayectoDesc: 'Cuanto más específico seas, menos avisos innecesarios recibirás',
    cuandoViajas: '¿Cuándo viajas?',
    frecuenciaFecha: 'Una fecha',
    frecuenciaDiaria: 'Cada día',
    frecuenciaLaborables: 'Lunes a viernes',
    recurrenteDiaria:
      'Trayecto cotidiano: te avisaremos cada día. No hace falta fecha: se renueva automáticamente.',
    recurrenteLaborables:
      'Trayecto cotidiano: te avisaremos cada día, de lunes a viernes. No hace falta fecha: se renueva automáticamente.',
    fechaLabel: 'Fecha del viaje',
    horaDesdeLabel: 'Hora desde (opcional)',
    horaHastaLabel: 'Hora hasta (opcional)',
    trenLabel: 'Tren concreto (opcional)',
    trenPlaceholder: 'Ej.: 03311 — vacío = se vigila todos los trenes',
    proximos: 'Próximos:',
    elegirProximo: 'Elige uno de los próximos o déjalo en blanco para vigilar todos.',
    criterioLabel: 'Qué quieres detectar',
    criterioDisponibilidad: 'Que se libere una plaza',
    criterioHorario: 'Cambios de horario',
    criterioRetrasoTren: 'Retrasos del tren',
    criterioVenta: 'Apertura de venta de billetes',
    criterioPrecio: 'Que baje el precio',
    intervaloLabel: 'Frecuencia de sondeo',
    intervaloCada: 'Cada {{min}} minutos',
    precioLabel: 'Avisarme si baja de X €',
    precioPlaceholder: 'Ej.: 30',
    precioTexto: 'Te avisaremos la primera vez que un tren baje a ese precio o por debajo.',
    bonoLabel: 'Tu bono / perfil',
    bonoTexto:
      'Guardamos tu perfil para personalizar los avisos. Renfe no publica las plazas por cupo de bono/abono en sus datos públicos: los avisos de disponibilidad se calculan sobre las tarifas generales de venta.',
    bonoGeneral: 'Sin bono / general',
    bonoBono10: 'Bono 10',
    bonoBono20: 'Bono 20',
    bonoJuvenil: 'Bono Joven',
    bonoEstudiante: 'Estudiante',
    bonoDiscapacidad: 'Discapacidad',
    bonoFamilia: 'Familia numerosa',
    bonoMayor60: 'Mayor de 60',
    bonoOtro: 'Otro',
    notasLabel: 'Notas (opcional)',
    notasPlaceholder: 'Ej.: solo clase Turista, quiero el tren de la tarde...',
    resumenTitulo: 'Resumen de la alerta',
    resumenProximas: 'Próximas salidas: {{horas}}',
    resumenLunesViernes: 'L-V',
    resumenCadaDia: 'Cada día',
    resumenSinFecha: 'Sin fecha',
    criterioPlazas: 'Plazas libres',
    criterioRetraso: 'Retraso',
    criterioHorarioCorto: 'Horario',
    criterioVentaCorta: 'Apertura de venta',
    criterioPrecioCorto: 'Precio',
    guardando: 'Guardando...',
    guardarCambios: 'Guardar cambios',
    crearYVigilar: 'Crear alerta y empezar a vigilar',
    errorOrigenDestino: 'Indica estación de origen y destino',
    errorFecha: 'Selecciona la fecha del viaje',
    errorPrecio: 'Indica el precio objetivo (€) del aviso',
    errorCampos: 'Revisa los campos del formulario',
    errorCargar: 'No se pudo cargar la alerta',
    errorGuardar: 'No se pudo guardar la alerta',
    toastActualizada: 'Alerta actualizada: {{resumen}}.',
    toastCreada: 'Alerta creada: {{resumen}}. Empezamos a vigilarla.',
    accionVuelta: 'Crear la vuelta',
  },

  // ──────────────────────────────── detalle de alerta
  detalleAlerta: {
    volver: 'Volver a mis alertas',
    titulo: 'Detalle de la alerta',
    incidenciaTitulo: 'Incidencia de servicio que puede afectar a esta ruta',
    verTodas: 'Ver todas las incidencias',
    sondeoNinguno: 'ninguno',
    compartir: 'Compartir',
    enlaceCopiado: 'Enlace copiado',
    promptCompartir: 'Copia el enlace para compartir este trayecto',
    calendario: 'Añadir al calendario',
    eventoDescargado: 'Evento descargado: ábrelo para añadirlo a tu calendario',
    errorIcs: 'No se ha podido descargar el archivo de calendario',
    notas: 'Notas: {{texto}}',
    retrasosHoy: 'Retrasos de hoy',
    plazasHoy: 'Plazas de hoy',
    sondeoSinDatos: 'Todavía no se ha sondeado esta alerta',
    sondeoHace: 'Último sondeo: {{hace}}',
    haceMomento: 'hace un momento',
    haceMin: 'hace {{min}} min',
    colHora: 'Hora',
    colPlazas: 'Plazas',
    colPrecioDesde: 'Precio desde',
    noParaEn: 'No para en: {{lista}}',
    vacioRetrasoSinSondeo: 'Todavía no se ha sondeado esta alerta — se consulta cada {{min}} min',
    vacioRetrasoFranja: 'Sin retrasos ahora mismo en tu franja ({{franja}})',
    vacioRetrasoRuta: 'Sin retrasos ahora mismo en tu ruta',
    vigilanciaTren: ' — vigilamos 1 tren',
    vacioPrecio: 'Aún no hay datos de precio — se consulta cada {{min}} min',
    vacioPlazas: 'Aún no hay datos de plazas — se consulta cada {{min}} min',
    vacioSoloDisponibilidad: 'Solo para alertas de disponibilidad',
    precioEvolucion: 'Evolución de precio',
    precioEvolucionDesc: '¿Compro ahora o espero? Puntos registrados en cada sondeo',
    precioSinHistorico:
      'Todavía no hay histórico de precios — se apunta cuando cambia el precio o aparecen plazas.',
    precioBase: 'Basado en nuestros sondeos cada {{min}} min; precio orientativo de venta',
    avisoTitulo: 'Avisos de esta alerta',
    avisoDesc: 'Historial de notificaciones que hemos enviado',
    sinAvisos: 'Todavía no hemos enviado avisos para esta alerta.',
    nuevo: 'Nuevo',
    tooltipSondeo1: '1 sondeo',
    tooltipSondeoN: '{{n}} sondeos',
    tooltipDisponible: 'disponible',
    tooltipCompleto: 'completo',
  },

  // ──────────────────────────────── bandeja de notificaciones
  notificaciones: {
    subtitulo: 'Avisos de tus alertas y recordatorios',
    activando: 'Activando...',
    activarPush: 'Activar push',
    marcarLeidas: 'Marcar leídas',
    limpiarLista: 'Limpiar lista',
    bandeja: 'Bandeja',
    bandejaDesc: 'Los avisos push también aparecen aquí',
    sinNotifs: 'No tienes notificaciones todavía. Crea una alerta y aparecerán aquí.',
    marcarOk: 'Marcadas como leídas',
    vaciarConfirm: '¿Vaciar la lista de avisos? Se borrarán todos.',
    vaciada: 'Lista vaciada',
    sinSoporte: 'Tu navegador no soporta notificaciones push',
    permisoDenegado: 'Permiso de notificaciones denegado',
    pushNoConfig: 'Push no configurado en el servidor (faltan claves VAPID)',
    pushOk: 'Notificaciones push activadas',
    pushError: 'No se pudo activar push',
  },

  // ──────────────────────────────── ajustes
  ajustes: {
    subtituloApp: 'Configuración de la aplicación',
    subtitulo: 'Tu perfil y notificaciones',
    temaTitulo: 'Tema',
    temaDesc: 'Apariencia clara u oscura',
    supabaseInfo:
      'Configura Supabase para desbloquear el perfil, las alertas y las notificaciones.',
    cuentaTitulo: 'Cuenta',
    cuentaDesc: 'Datos de tu sesión',
    proveedor: 'Proveedor: {{proveedor}}',
    notificacionesTitulo: 'Notificaciones',
    notificacionesDesc: 'Cómo quieres recibir los avisos',
    pushLabel: 'Notificaciones push',
    pushDesc: 'Avisos al navegador o a la PWA',
    emailLabel: 'Notificaciones por email',
    emailDesc: 'Resumen cuando haya plaza',
    recordatorioLabel: 'Cuenta atrás a la salida',
    recordatorioDesc: '«Te faltan X minutos para tu tren»',
    resumenLabel: 'Resumen del viaje',
    resumenDesc: 'Por la mañana del día del viaje: horario, tren y retraso',
    antelacionLabel: 'Avisarme con antelación',
    antelacionOpcion: '{{min}} minutos antes',
    aparienciaTitulo: 'Apariencia',
    aparienciaDesc: 'Tema de la aplicación',
    guardadas: 'Preferencias guardadas',
    noGuardar: 'No se pudo guardar',
  },

  // ──────────────────────────────── errores de Supabase Auth
  erroresAuth: {
    credenciales:
      'Email o contraseña incorrectos. Si acabas de crear la cuenta, comprueba que la contraseña sea la misma.',
    confirmarEmail: 'Falta confirmar el email: revisa tu bandeja de entrada (y spam).',
    cuentaExiste: 'Ya existe una cuenta con ese email. Inicia sesión en su lugar.',
    emailInvalido:
      'Supabase rechaza ese email: revisa la lista de dominios permitidos en Authentication → Settings.',
    passwordDebil: 'La contraseña es demasiado débil: usa al menos 8 caracteres.',
    proveedor:
      'Este proveedor de acceso (Google/Outlook) aún no está habilitado en Supabase → Authentication → Providers.',
    registroDeshabilitado:
      'El registro está deshabilitado en Supabase → Authentication → Settings.',
    limiteIntentos: 'Demasiados intentos seguidos: espera un minuto y vuelve a probar.',
    emailNoAceptado:
      'Supabase no acepta ese email (puede estar en la lista de dominios bloqueados). Prueba con otro correo.',
  },
} as const;

/** Árbol de claves del diccionario: `en.ts` debe reproducirlo exactamente. */
export type Claves = typeof es;
