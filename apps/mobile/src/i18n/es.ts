/**
 * Diccionario ES: única fuente de verdad de los textos de la app móvil.
 * El fichero `en.ts` debe tener exactamente el mismo árbol de claves (lo
 * comprueba el tipo `MismoArbol` y, en ejecución, `i18n.test.ts`).
 *
 * Convención: claves en camelCase, un bloque por pantalla/componente, e
 * interpolación i18next con `{{variable}}`.
 */
export const es = {
  // ──────────────────────────────── comunes
  comunes: {
    error: 'Error',
    cancelar: 'Cancelar',
    eliminar: 'Eliminar',
    editar: 'Editar',
    cerrar: 'Cerrar',
    compartir: 'Compartir',
    email: 'Email',
    contrasena: 'Contraseña',
    nombre: 'Nombre',
    origen: 'Origen',
    destino: 'Destino',
    nuevo: 'Nuevo',
    cancelado: 'Cancelado',
    completo: 'Completo',
    hayPlazas: 'Hay plazas',
    sinDatos: 'Sin datos',
    plazas: 'Plazas',
    errorActualizar: 'No se pudo actualizar',
    avisoConfig:
      'Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en .env',
    y: ' y ',
    incidencias: 'Incidencias',
    suprimidos: 'Suprimidos',
    iniciarSesion: 'Iniciar sesión',
    crearCuenta: 'Crear cuenta',
  },

  // ──────────────────────────────── pestañas
  pestanas: {
    alertas: 'Alertas',
    trenes: 'Trenes',
    avisos: 'Avisos',
    ajustes: 'Ajustes',
  },

  // ──────────────────────────────── inicio (app/index.tsx)
  inicio: {
    lema: 'Alertas de disponibilidad, cuenta atrás de tu viaje y trenes en tiempo real',
  },

  // ──────────────────────────────── login
  login: {
    google: 'Continuar con Google',
    oauthError:
      'No se pudo iniciar sesión con Google. Asegúrate de que Google está habilitado en Supabase y de que el deep link esté autorizado en Redirect URLs.',
    faltanTitulo: 'Faltan datos',
    faltanCuerpo: 'Introduce email y contraseña',
    errorGenerico: 'No se pudo iniciar sesión',
    entrando: 'Entrando...',
    entrar: 'Entrar',
    sinCuenta: '¿Aún no tienes cuenta? Regístrate',
  },

  // ──────────────────────────────── registro
  registro: {
    revisaTitulo: 'Revisa los datos',
    revisaCuerpo: 'Nombre, email y contraseña (mín. 6) son obligatorios',
    creadaTitulo: 'Cuenta creada',
    creadaConfirmacion: 'Revisa tu email para confirmar el registro.',
    creadaDentro: 'Ya estás dentro de la cuenta.',
    errorGenerico: 'No se pudo registrar',
    placeholderNombre: 'Tu nombre',
    placeholderContrasena: 'Mínimo 6 caracteres',
    creando: 'Creando...',
    cuentaExiste: '¿Ya tienes cuenta? Inicia sesión',
  },

  // ──────────────────────────────── nueva alerta (alertas/nueva.tsx)
  nueva: {
    titulo: 'Nueva alerta',
    editarTitulo: 'Editar alerta',
    editarSubtitulo: 'Modifica cualquier dato; reiniciaremos los avisos si cambia la ruta',
    errorCargar: 'No se pudo cargar la alerta',
    errorGuardar: 'No se pudo guardar la alerta',
    revisaCampos: 'Revisa los campos',
    datosInvalidos: 'Datos inválidos',
    creadaTitulo: 'Alerta creada',
    creadaCuerpo: '{{resumen}}\n\nEmpezamos a vigilar este trayecto.',
    actualizadaTitulo: 'Alerta actualizada',
    actualizadaCuerpo: '{{resumen}}\n\nLos cambios ya están aplicados.',
    ahoraNo: 'Ahora no',
    crearVuelta: 'Crear la vuelta',
    tipoAviso: 'Tipo de aviso',
    precioObjetivo: 'Avisarme si baja de X €',
    placeholderPrecio: 'Ej.: 30',
    placeholderOrigen: 'Estación de origen',
    placeholderDestino: 'Estación de destino',
    cuando: '¿Cuándo viajas?',
    cotidianoDiaria: 'Trayecto cotidiano: te avisaremos cada día. No hace falta indicar fecha.',
    cotidianoLaborables:
      'Trayecto cotidiano: te avisaremos de lunes a viernes. No hace falta indicar fecha.',
    fechaViaje: 'Fecha del viaje',
    minimo: 'Mínimo: {{fecha}}',
    franja: 'Franja horaria (opcional)',
    desdeHora: 'Desde HH:MM',
    hastaHora: 'Hasta HH:MM',
    soloFranja: 'Solo avisaremos de salidas dentro de esa franja',
    trenConcreto: 'Tren concreto (opcional)',
    placeholderTren: 'Ej.: 03311 — vacío = todos los trenes',
    proximosTrenes: 'Próximos trenes (toca para elegir):',
    intervalo: 'Intervalo de sondeo',
    bono: 'Bono',
    avisoBono:
      'Guardamos tu perfil para personalizar los avisos. Renfe no publica las plazas por cupo de bono/abono: los avisos de disponibilidad se calculan sobre las tarifas generales.',
    notas: 'Notas (opcional)',
    placeholderNotas: 'Ej. asiento junto a ventanilla...',
    resumenTitulo: 'Resumen de la alerta',
    proximasSalidas: 'Próximas salidas: {{salidas}}',
    creando: 'Creando...',
    crear: 'Crear alerta',
    sinFecha: 'Sin fecha',
    cadaMin: 'cada {{min}} min',
    resumenLaborables: 'L-V',
    criterio: {
      disponibilidad: 'Plazas libres',
      retraso: 'Retraso',
      horario: 'Horario',
      aperturaVenta: 'Apertura de venta',
      precio: 'Precio',
    },
    desc: {
      disponibilidad: 'Te avisaremos cuando haya plazas libres en este trayecto',
      retraso: 'Te avisaremos cuando tus trenes vayan con retraso (5+ min)',
      horario: 'Te avisaremos si cambian los horarios programados',
      aperturaVenta: 'Te avisaremos cuando se abra la venta de billetes',
      precio: 'Te avisaremos si el precio baja de tu objetivo',
    },
    frecuencia: {
      fecha: 'Una fecha',
      diaria: 'Cada día',
      laborables: 'Lunes a viernes',
    },
  },

  // ──────────────────────────────── detalle de alerta (alertas/[id].tsx)
  detalle: {
    titulo: 'Alerta',
    haceMomento: 'hace un momento',
    haceMin: 'hace {{min}} min',
    sinSondeo: 'Todavía no se ha sondeado esta alerta — se consulta cada {{min}} min',
    enFranja: 'en tu franja ({{franja}})',
    enRuta: 'en tu ruta',
    vigilamos1: ' — vigilamos 1 tren',
    sinRetrasos: 'Sin retrasos ahora mismo {{donde}}{{vigilancia}}',
    sinPrecio: 'Aún no hay datos de precio — se consulta cada {{min}} min',
    sinPlazas: 'Aún no hay datos de plazas — se consulta cada {{min}} min',
    soloDisponibilidad: 'Solo para alertas de disponibilidad',
    llega: 'llega {{hora}}',
    compartirTitulo: 'Compartir alerta',
    calendarioTitulo: 'Añadir al calendario',
    calendarioError:
      'No se ha podido compartir el evento. Vuelve a intentarlo o entra en MantiRenfe desde el navegador para descargar el archivo .ics.',
    laborables: 'L-V: Cada día laborable',
    cadaDia: 'Cada día',
    metaAlerta: '{{fecha}} · {{criterio}} · cada {{min}} min · {{bono}}',
    objetivo: 'Objetivo: avisar si baja de {{precio}}',
    franja: 'Franja: {{desde}} – {{hasta}}',
    trenSufijo: ' · tren {{tren}}',
    tren: 'Tren {{tren}}',
    ultimoSondeo: 'Último sondeo: {{valor}}',
    ninguno: 'todavía ninguno',
    hoyRetrasos: 'Retrasos de hoy',
    hoyPlazas: 'Plazas de hoy',
    desde: 'Desde {{precio}}',
    noPara: 'No para en: {{lista}}',
    evolucionTitulo: 'Evolución de precio',
    evolucionSubtitulo: '¿Compro ahora o espero? Puntos de cada sondeo',
    sinEvolucion: 'Aún no hay evolución de precios',
    avisosTitulo: 'Avisos de esta alerta',
    sinAvisos: 'Sin avisos todavía para esta alerta.',
  },

  // ──────────────────────────────── lista de alertas ((tabs)/index.tsx)
  lista: {
    titulo: 'Mis alertas',
    nueva: '+ Nueva',
    vacioTitulo: 'Aún no tienes alertas',
    vacioTexto: 'Crea una para tu próximo viaje y te avisaremos si se libera plaza.',
    crearPrimera: 'Crear la primera',
    eliminarTitulo: 'Eliminar alerta',
    eliminarCuerpo: '¿Vigilar {{origen}} → {{destino}}?',
    a11yVer: 'Ver detalle de {{origen}} a {{destino}}',
    a11yPista: 'Muestra las plazas, la evolución del precio y los avisos',
    metaAlerta: '{{fecha}} · cada {{min}} min · {{bono}}',
    pausar: 'Pausar',
    reanudar: 'Reanudar',
  },

  // ──────────────────────────────── tarjeta «Tu próximo viaje»
  viaje: {
    titulo: 'Tu próximo viaje',
    vacio: 'Aún no hay ninguna salida en camino',
    a11yRuta: '{{origen}} a {{destino}}',
    a11yPista: 'Abre el detalle de la alerta',
    horaPorConfirmar: 'hora por confirmar',
    tren: 'tren {{tren}}',
    sinPlazas: 'Aún no sabemos las plazas: comprobamos cada {{min}} min',
    tambien: 'Y también:',
    a11yFila: '{{fila}} de {{origen}} a {{destino}}',
  },

  // ──────────────────────────────── avisos ((tabs)/avisos.tsx)
  avisos: {
    sinLeer: '{{n}} sin leer',
    todoAlDia: 'Todo al día',
    marcarLeidas: 'Marcar leídas',
    limpiar: 'Limpiar',
    limpiarTitulo: 'Limpiar avisos',
    limpiarCuerpo: '¿Borrar todos los avisos de la lista?',
    borrar: 'Borrar',
    errorVaciar: 'No se pudo vaciar la lista',
    vacioTitulo: 'Sin avisos todavía',
    vacioTexto: 'Cuando una alerta detecte cambios, el aviso aparecerá aquí.',
  },

  // ──────────────────────────────── trenes ((tabs)/trenes.tsx)
  trenes: {
    modo: {
      estaciones: 'Estaciones',
      horarios: 'Horarios',
      posiciones: 'Tiempo real',
      impuntuales: 'Impuntuales',
    },
    franja: {
      todo: 'Todo',
      manana: 'Mañana (06-12)',
      tarde: 'Tarde (12-20)',
      noche: 'Noche (20-24)',
    },
    orden: {
      veces: 'Más veces',
      retraso: 'Mayor retraso',
    },
    vistaLista: 'Lista',
    vistaMapa: 'Mapa',
    placeholderBuscar: 'Buscar estación...',
    placeholderFiltrar: 'Filtrar trenes (nº, origen, destino)...',
    placeholderOrigen: 'Origen (ej. Madrid)',
    placeholderDestino: 'Destino (ej. Sevilla)',
    buscando: 'Buscando...',
    buscarHorarios: 'Buscar horarios',
    errorBusqueda: 'Error en la búsqueda',
    cargandoSalidas: 'Cargando salidas...',
    salidasDe: 'Salidas de {{estacion}} hoy',
    cargandoEstacion: 'Cargando datos de la estación…',
    verMapa: 'Ver en mapa',
    aforo: 'Aforo histórico (2018)',
    viajeros: '{{n}} viajeros',
    sinSalidas: 'Sin salidas registradas hoy',
    tocaSalidas: '{{meta}} — toca para ver salidas',
    noEstaciones: 'No se encontraron estaciones',
    estacionNoEncontrada: 'Estación no encontrada',
    sinTrenesRuta: 'Sin trenes con esa ruta',
    noEncontramos:
      'No encontramos la estación {{lista}}. Revisa el nombre (tildes, «La Coruña» = «A Coruña»).',
    indicada: 'indicada',
    sinDirectos:
      'Sin trenes directos ni con conexión de {{origen}} a {{destino}} para el {{fecha}}. Prueba otro día o divide el viaje en dos tramos.',
    crearAlerta: 'Crear alerta de disponibilidad',
    mostrando: 'Mostrando {{visibles}} de {{total}} salidas',
    sinSalidasFranja: 'Ninguna salida en esa franja',
    pruebaFranja: 'Prueba otra franja o vuelve a «{{todo}}».',
    transbordo: 'Transbordo en {{estacion}}',
    transbordoDetalle:
      '{{tren1}} llega a las {{hora1}} · espera {{espera}} min · {{tren2}} sale a las {{hora2}}',
    masAlerta: '+ Alerta',
    sinPosiciones: 'Sin posiciones GTFS-RT ahora mismo',
    sinCoincidencias: 'Sin trenes que coincidan con «{{filtro}}»',
    aTiempo: 'A tiempo',
    salidaHora: 'Salida {{hora}}',
    llegadaHora: 'Llegada {{hora}}',
    compromiso: 'Compromiso de Renfe: {{texto}}',
    cargandoImpuntualidad: 'Cargando impuntualidad…',
    sinImpuntualidad: 'Aún sin datos de impuntualidad este mes',
    veces: '{{n}} veces',
    retrasoMedio: 'Retraso medio {{medio}} · Peor {{peor}}',
    llegadaEstimada: 'estimada {{hora}} (máx. retraso)',
  },

  // ──────────────────────────────── ajustes ((tabs)/ajustes.tsx)
  ajustes: {
    cuenta: 'Cuenta',
    sinSesion: 'Sin sesión',
    supabaseSinConfig: 'Supabase sin configurar en este entorno',
    apariencia: 'Apariencia',
    temaClaro: 'Claro',
    temaOscuro: 'Oscuro',
    temaSistema: 'Sistema',
    idioma: 'Idioma',
    notificaciones: 'Notificaciones',
    pushDisponibilidad: 'Push de disponibilidad',
    pushOk: 'Avisos push activados en este dispositivo',
    pushKo: 'Avisos push desactivados en este dispositivo',
    pushError: 'No se pudo actualizar el registro push',
    recordatorio: 'Recordatorio de salida (50 min)',
    resumen: 'Resumen del viaje (mañana del día)',
    guardando: 'Guardando...',
    cerrarSesion: 'Cerrar sesión',
  },

  // ──────────────────────────────── incidencias
  incidencias: {
    titulo: 'Incidencias de servicio',
    subtitulo: 'Avisos y incidencias de cercanías publicados por Renfe en tiempo real',
    vacioTitulo: 'Sin incidencias activas ahora mismo',
    vacioTexto: 'Si aparece alguna, la verás aquí en cuanto el feed de Renfe la publique.',
    fallbackTitulo: 'Incidencia de servicio',
    sinEstacion: 'Afecta a líneas del servicio, sin estación concreta indicada',
    desde: 'Desde el {{fecha}}',
    hasta: 'Hasta el {{fecha}}',
    sinPeriodo: 'Periodo no indicado',
  },

  // ──────────────────────────────── suprimidos
  suprimidos: {
    consultar: 'Consultar supresiones',
    fecha: 'Fecha (YYYY-MM-DD)',
    historico: 'Histórico disponible: desde el {{fecha}}',
    fechaInvalida: 'Fecha no válida: usa YYYY-MM-DD entre el {{fecha}} y hoy',
    estacion: 'Estación (opcional)',
    quitarFiltro: 'Quitar filtro de {{estacion}}',
    buscar: 'Buscar',
    buscando: 'Buscando...',
    buscandoLista: 'Buscando supresiones…',
    vacio:
      'Sin trenes suprimidos en esa fecha (cubrimos Larga Distancia; Cercanías cancela rara veces)',
    tren: 'tren {{tren}}',
    llegada: 'Llegada {{hora}}',
  },

  // ──────────────────────────────── etiquetas de alertas (lib/alertas.ts)
  alertas: {
    bono: {
      GENERAL: 'Sin bono / general',
      BONO_10: 'Bono 10',
      BONO_20: 'Bono 20',
      JUVENIL: 'Bono Joven',
      ESTUDIANTE: 'Estudiante',
      DISCAPACIDAD: 'Discapacidad',
      FAMILIA_NUMEROSA: 'Familia numerosa',
      MAYOR_60: 'Mayor de 60',
      OTRO: 'Otro',
    },
    estado: {
      ACTIVA: 'Activa',
      PAUSA: 'En pausa',
      COMPLETADA: 'Completada',
    },
    criterio: {
      DISPONIBILIDAD: 'Plazas libres',
      RETRASO: 'Retraso',
      HORARIO: 'Horario',
      APERTURA_VENTA: 'Apertura de venta',
      PRECIO: 'Precio',
    },
    aviso: 'aviso',
    avisos: 'avisos',
  },

  // ──────────────────────────────── precios (lib/precios.ts)
  precios: {
    seriePlana: '{{hora}}{{tren}} — {{precio}} ({{resumen}})',
    tren: ' · tren {{tren}}',
    sondeosUno: 'sin cambios · {{n}} sondeo',
    sondeosVarios: 'sin cambios · {{n}} sondeos',
    ocultosUno: '…y {{n}} sondeo anterior',
    ocultosVarios: '…y {{n}} sondeos anteriores',
    sinDatos: 'Sin datos de precio todavía',
    sube: 'Sube: el mínimo fue {{minimo}} el {{fecha}}',
    haBajado: 'El precio ha bajado desde {{precio}} → buen momento',
    estable: 'Precio estable en las últimas {{horas}} h',
  },

  // ──────────────────────────────── próximo viaje (lib/proximoViaje.ts)
  proximo: {
    haSalido: 'ha salido',
    menosDeMin: 'faltan menos de 1 min',
    diasHoras: 'faltan {{dias}} d {{horas}} h',
    horasMin: 'faltan {{horas}} h {{min}} min',
    horas: 'faltan {{horas}} h',
    minutos: 'faltan {{minutos}} min',
    hoy: 'Hoy',
    manana: 'Mañana',
    diaNumero: '{{dia}} {{n}}',
    hayPlazasDesde: 'Hay plazas desde {{precio}}',
    sinPlazas: 'Sin datos de plazas aún',
  },

  // ──────────────────────────────── días de la semana (etiquetas de fecha)
  semana: {
    domingo: 'domingo',
    lunes: 'lunes',
    martes: 'martes',
    miercoles: 'miércoles',
    jueves: 'jueves',
    viernes: 'viernes',
    sabado: 'sábado',
  },

  // ──────────────────────────────── widget de pantalla de inicio
  widget: {
    titulo: 'PRÓXIMO TREN',
    proximoViaje: 'Próximo viaje: {{fecha}}',
    sinSalidas: 'Sin salidas de hoy. Abre MantiRenfe para refrescar tus alertas.',
    sinSalidasCorto: 'Sin salidas',
    manana: 'mañana',
    accesibilidad: 'Próximo tren, abre MantiRenfe',
  },

  // ──────────────────────────────── evento de calendario (.ics)
  ics: {
    aviso: 'Aviso: {{ruta}}',
    tren: ' (tren {{tren}})',
    alerta: 'Alerta de MantiRenfe: {{ruta}}',
    fecha: 'Fecha: {{fecha}}',
    franja: 'Franja: {{desde}} – {{hasta}}',
    trenLinea: 'Tren {{tren}}',
    recordatorio: 'Recordatorio de salida: {{ruta}}',
  },

  // ──────────────────────────────── avisos push (lib/push.ts)
  push: {
    sinFirebase:
      'Push no disponible en esta build: faltan las credenciales de Firebase (FCM). Configúralas con "npx eas credentials" → Android → Push notifications y vuelve a compilar el APK.',
    sinProjectId: 'Falta el projectId de EAS: ejecuta "npx eas-cli init" en apps/mobile',
    soloMovil: 'Los avisos push solo funcionan en iOS y Android',
    permisoDenegado: 'Permiso de notificaciones denegado',
    canal: 'Avisos de trenes',
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
};

export type Claves = typeof es;
