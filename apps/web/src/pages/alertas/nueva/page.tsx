import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useBuscadorEstaciones } from '@/hooks/useBuscadorEstaciones';
import { construirAlertaVuelta } from '@/lib/alertas';
import { DIAS_LABORABLES } from '@mantirenfe/shared-types';
import { fechaGtfs, fechaMaximaAlerta } from '@mantirenfe/shared-types';
import type { AlertaResponse, CriterioAlerta, HorarioTrenResponse } from '@mantirenfe/shared-types';
import {
  MAX_CRITERIOS,
  calcularResumen,
  datosDeAlerta,
  errorDeFormulario,
  frecuenciaDe,
  salidasFuturas,
  type EstadoFormulario,
  type Frecuencia,
} from './logica';
import { CabeceraSeccion } from './cabecera-seccion';
import { FormularioSeccion } from './formulario-seccion';
import { TrayectoSeccion } from './trayecto-seccion';
import { FrecuenciaSeccion } from './frecuencia-seccion';
import { FranjaSeccion } from './franja-seccion';
import { TrenSeccion } from './tren-seccion';
import { CriteriosSeccion } from './criterios-seccion';
import { BonoSeccion } from './bono-seccion';
import { NotasSeccion } from './notas-seccion';
import { VueltaSeccion } from './vuelta-seccion';
import { ResumenSeccion } from './resumen-seccion';

export function PaginaNuevaAlerta() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editandoId = params.get('editar');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [fecha, setFecha] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('fecha');
  // Días marcados para "Días concretos" (preselección: lunes a viernes)
  const [dias, setDias] = useState<number[]>([...DIAS_LABORABLES]);
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  // Criterios vigilados (multi-selección): nunca vacío y como mucho 4
  const [criterios, setCriterios] = useState<CriterioAlerta[]>(['DISPONIBILIDAD']);
  // Permitir 1 escala si no hay directo con plazas (solo con DISPONIBILIDAD)
  const [conexiones, setConexiones] = useState(false);
  const [precioObjetivo, setPrecioObjetivo] = useState('');
  const [intervalo, setIntervalo] = useState(10);
  const [bono, setBono] = useState('GENERAL');
  const [numeroTren, setNumeroTren] = useState('');
  const [notas, setNotas] = useState('');
  const [tambienVuelta, setTambienVuelta] = useState(false);
  const [fechaVuelta, setFechaVuelta] = useState('');
  // Franja horaria propia de la vuelta: vacía = usar la de la ida
  const [horaDesdeVuelta, setHoraDesdeVuelta] = useState('');
  const [horaHastaVuelta, setHoraHastaVuelta] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Mientras carga la alerta en modo edición el formulario viene "vacío" (criterio
  // DISPONIBILIDAD por defecto); si el usuario toca el selector antes de que llegue
  // la respuesta, aplicar la carga lo pisaría. Se bloquea y solo se carga una vez.
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const edicionCargada = useRef<string | null>(null);
  const [trenesSugeridos, setTrenesSugeridos] = useState<HorarioTrenResponse[]>([]);

  const hoyIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaMin = hoyIso;
  // Antelación máxima: hoy + VENTANA_GTFS_DIAS, donde se cortan los horarios
  // materializados por el sync. La API valida lo mismo, así que un valor fuera
  // de rango ni siquiera llegaría a guardarse.
  const fechaMax = useMemo(() => fechaMaximaAlerta(fechaGtfs()), []);
  // La fecha que viaja al servidor: cotidiano y "cualquier fecha" se anclan a hoy
  const flexible = frecuencia === 'flexible';
  const fechaEfectiva = frecuencia === 'fecha' ? fecha : hoyIso;

  // Búsqueda de estaciones mientras se escribe (con debounce): la lista inicial
  // solo traía las primeras40 alfabéticas y nunca aparecían, p.ej., las de Vigo.
  // Una lista por campo (mismo patrón que la página de trenes): así escribir en
  // Destino no deja a la vista las sugerencias de Origen ni viceversa.
  const busOrigen = useBuscadorEstaciones({ limite: 10 });
  const busDestino = useBuscadorEstaciones({ limite: 10 });
  const { sugerencias: sugOrigen } = busOrigen;
  const { sugerencias: sugDestino } = busDestino;

  // Cierra los dos desplegables y cancela sus peticiones pendientes: escribir
  // en un campo (o elegir una opción) no debe dejar a la vista la lista del otro.
  const limpiarSugerencias = (conservar?: 'origen' | 'destino') => {
    if (conservar !== 'origen') busOrigen.limpiar();
    if (conservar !== 'destino') busDestino.limpiar();
  };

  const sugerir = (campo: 'origen' | 'destino', texto: string) => {
    limpiarSugerencias(campo);
    (campo === 'origen' ? busOrigen : busDestino).sugerir(texto);
  };

  const cambiarOrigen = (valor: string) => {
    setOrigen(valor);
    sugerir('origen', valor);
    setNumeroTren(''); // la ruta cambió: el tren elegido ya no aplica
  };

  const cambiarDestino = (valor: string) => {
    setDestino(valor);
    sugerir('destino', valor);
    setNumeroTren('');
  };

  const cambiarFecha = (valor: string) => {
    setFecha(valor);
    setNumeroTren(''); // el tren elegido es de otra fecha
  };

  const alternarDia = (dia: number, marcado: boolean) => {
    setDias((prev) =>
      marcado ? prev.filter((d) => d !== dia) : [...prev, dia].sort((a, b) => a - b),
    );
  };

  /**
   * Marca o desmarca la vuelta. Al activarla se precargan los valores por
   * defecto: fecha +2 días (o de hoy) y la franja horaria de la ida.
   */
  const cambiarVuelta = (activo: boolean) => {
    setTambienVuelta(activo);
    if (activo) {
      if (!fechaVuelta) {
        // Por defecto, dos días después de la ida (o de hoy)
        const base = frecuencia === 'fecha' && fecha ? fecha : hoyIso;
        const d = new Date(`${base}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 2);
        setFechaVuelta(d.toISOString().slice(0, 10));
      }
      // La vuelta arranca con la franja de la ida (editable después)
      if (!horaDesdeVuelta) setHoraDesdeVuelta(horaDesde);
      if (!horaHastaVuelta) setHoraHastaVuelta(horaHasta);
    }
  };

  /**
   * Alterna un criterio de la multi-selección. La lista nunca se queda vacía
   * (el último seleccionado no se desmarca) ni pasa del máximo permitido.
   */
  const alternarCriterio = (valor: CriterioAlerta) => {
    if (cargandoEdicion) return;
    if (criterios.includes(valor)) {
      if (criterios.length > 1) setCriterios(criterios.filter((c) => c !== valor));
      return;
    }
    if (criterios.length >= MAX_CRITERIOS) {
      toast.error(t('nuevaAlerta.errorMaxCriterios'));
      return;
    }
    setCriterios([...criterios, valor]);
  };

  // Precarga desde la búsqueda de trenes (?origen=&destino=&fecha=&numeroTren=)
  // o carga completa al modo edición (?editar=<id>)
  useEffect(() => {
    const origenParam = params.get('origen');
    const destinoParam = params.get('destino');
    const fechaParam = params.get('fecha');
    const trenParam = params.get('numeroTren');
    if (origenParam) setOrigen(origenParam);
    if (destinoParam) setDestino(destinoParam);
    if (fechaParam) setFecha(fechaParam);
    if (trenParam) setNumeroTren(trenParam);

    if (editandoId && edicionCargada.current !== editandoId) {
      edicionCargada.current = editandoId;
      setCargandoEdicion(true);
      api<AlertaResponse>(`/alertas/${editandoId}`)
        .then((a) => {
          setOrigen(a.origenNombre);
          setDestino(a.destinoNombre);
          setFecha(a.fechaViaje);
          setFrecuencia(frecuenciaDe(a));
          setDias(a.diasSemana.length > 0 ? [...a.diasSemana] : [...DIAS_LABORABLES]);
          setHoraDesde(a.horaDesde ?? '');
          setHoraHasta(a.horaHasta ?? '');
          // Multi-criterio: la lista manda; las alertas legadas traen `[criterio]`
          setCriterios(a.criterios?.length ? [...a.criterios] : [a.criterio]);
          setConexiones(a.conexiones === true);
          setPrecioObjetivo(a.precioObjetivo != null ? String(a.precioObjetivo) : '');
          setIntervalo(a.intervaloSondeoMin);
          setBono(a.bono);
          setNotas(a.notas ?? '');
          setNumeroTren(a.numeroTren ?? '');
        })
        .catch(() => toast.error(t('nuevaAlerta.errorCargar')))
        .finally(() => setCargandoEdicion(false));
    }
  }, [params, editandoId]);

  // Los 3 próximos trenes de la ruta (para elegir sin escribir el número).
  // Debounce amplio (800 ms) y mínimo 4 caracteres por campo: mientras el
  // usuario sigue escribiendo no se dispara ninguna petición.
  const cacheHorarios = useRef(new Map<string, HorarioTrenResponse[]>());
  useEffect(() => {
    // Con "cualquier fecha" no hay día del que sugerir salidas
    if (flexible || origen.trim().length < 4 || destino.trim().length < 4 || !fechaEfectiva) {
      setTrenesSugeridos([]);
      return;
    }
    const clave = `${origen.trim()}|${destino.trim()}|${fechaEfectiva}`;
    const enCache = cacheHorarios.current.get(clave);
    if (enCache) {
      // Ya pedimos esta combinación: ni debounce ni petición
      setTrenesSugeridos(salidasFuturas(enCache, fechaEfectiva, hoyIso));
      return;
    }
    const controlador = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ trenes: HorarioTrenResponse[] }>(
        `/trenes/horarios?origen=${encodeURIComponent(origen.trim())}&destino=${encodeURIComponent(destino.trim())}&fecha=${fechaEfectiva}`,
        { signal: controlador.signal },
      )
        .then((d) => {
          cacheHorarios.current.set(clave, d.trenes);
          // Caché acotada: como mucho 50 combinaciones por sesión
          if (cacheHorarios.current.size > 50) {
            const primera = cacheHorarios.current.keys().next().value;
            if (primera !== undefined) cacheHorarios.current.delete(primera);
          }
          setTrenesSugeridos(salidasFuturas(d.trenes, fechaEfectiva, hoyIso));
        })
        .catch(() => undefined);
    }, 800);
    return () => {
      window.clearTimeout(timer);
      controlador.abort();
    };
  }, [origen, destino, fechaEfectiva, hoyIso, flexible]);

  // Fotografía del formulario en este render: la validan, resumen y payload
  const estado: EstadoFormulario = {
    origen,
    destino,
    frecuencia,
    fecha,
    dias,
    horaDesde,
    horaHasta,
    criterios,
    conexiones,
    precioObjetivo,
    intervalo,
    bono,
    numeroTren,
    notas,
    tambienVuelta,
    fechaVuelta,
    horaDesdeVuelta,
    horaHastaVuelta,
  };
  const resumenAlerta = calcularResumen(estado, trenesSugeridos, t);
  const resumen = resumenAlerta.texto;

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    const error = errorDeFormulario(estado, t);
    if (error) {
      toast.error(error);
      return;
    }

    setEnviando(true);
    try {
      const url = editandoId ? `/alertas/${editandoId}` : '/alertas';
      const metodo = editandoId ? 'PATCH' : 'POST';
      const datos = datosDeAlerta(estado, fechaEfectiva);
      // Formulario de la vuelta precargado (extremos invertidos): lo usan la
      // acción del toast y el aviso de fallo para poder reintentarla.
      const rutaVuelta = `/alertas/nueva?origen=${encodeURIComponent(
        datos.destinoNombre,
      )}&destino=${encodeURIComponent(datos.origenNombre)}&fecha=${encodeURIComponent(
        fechaVuelta || fechaEfectiva,
      )}`;
      const resultado = await api<{ id?: string; error?: unknown }>(url, {
        method: metodo,
        json: datos,
      });

      if (resultado?.error) {
        toast.error(t('nuevaAlerta.errorCampos'));
        return;
      }

      const accionVuelta = {
        label: t('nuevaAlerta.accionVuelta'),
        onClick: () => navigate(rutaVuelta),
      };

      if (editandoId) {
        toast.success(t('nuevaAlerta.toastActualizada', { resumen }));
      } else if (tambienVuelta) {
        // La ida ya está creada: la vuelta va como segunda petición con la
        // misma alerta y los extremos invertidos. Si falla, no celebramos:
        // avisamos de forma diferenciada y dejamos el reintento a un clic.
        let vueltaCreada = false;
        try {
          const vuelta = await api<{ id?: string; error?: unknown }>('/alertas', {
            method: 'POST',
            json: {
              ...construirAlertaVuelta({
                ...datos,
                fechaViaje: fechaVuelta || datos.fechaViaje,
                // Franja propia de la vuelta: vacía = la misma que la ida
                horaDesde: horaDesdeVuelta.trim() || datos.horaDesde,
                horaHasta: horaHastaVuelta.trim() || datos.horaHasta,
              }),
              // La vuelta apunta a la ida para que el listado las muestre juntas
              grupoId: resultado.id,
            },
          });
          vueltaCreada = !vuelta?.error;
        } catch {
          vueltaCreada = false;
        }
        if (vueltaCreada) {
          toast.success(t('nuevaAlerta.toastCreadasVuelta', { resumen }), { duration: 8000 });
        } else {
          toast.error(t('nuevaAlerta.errorVuelta'), { duration: 10000, action: accionVuelta });
        }
      } else {
        toast.success(t('nuevaAlerta.toastCreada', { resumen }), {
          duration: 8000,
          action: accionVuelta,
        });
      }
      navigate('/alertas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('nuevaAlerta.errorGuardar'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <CabeceraSeccion editando={Boolean(editandoId)} onVolver={() => navigate('/alertas')} />

      <FormularioSeccion onSubmit={enviar} enviando={enviando} editando={Boolean(editandoId)}>
        <TrayectoSeccion
          estado={estado}
          onOrigen={cambiarOrigen}
          onDestino={cambiarDestino}
          sugerenciasOrigen={sugOrigen}
          sugerenciasDestino={sugDestino}
        />
        <FrecuenciaSeccion
          estado={estado}
          onFrecuencia={setFrecuencia}
          onAlternarDia={alternarDia}
        />
        <FranjaSeccion
          estado={estado}
          fechaMin={fechaMin}
          fechaMax={fechaMax}
          onFecha={cambiarFecha}
          onHoraDesde={setHoraDesde}
          onHoraHasta={setHoraHasta}
        />
        <TrenSeccion
          estado={estado}
          onNumeroTren={setNumeroTren}
          trenesSugeridos={trenesSugeridos}
        />
        <CriteriosSeccion
          estado={estado}
          cargandoEdicion={cargandoEdicion}
          onAlternar={alternarCriterio}
          onConexiones={setConexiones}
          onIntervalo={setIntervalo}
          onPrecioObjetivo={setPrecioObjetivo}
        />
        <BonoSeccion estado={estado} onBono={setBono} />
        <NotasSeccion estado={estado} onNotas={setNotas} />
        {!editandoId && (
          <VueltaSeccion
            estado={estado}
            fechaMin={fechaMin}
            fechaMax={fechaMax}
            onTambienVuelta={cambiarVuelta}
            onFechaVuelta={setFechaVuelta}
            onHoraDesdeVuelta={setHoraDesdeVuelta}
            onHoraHastaVuelta={setHoraHastaVuelta}
          />
        )}
        <ResumenSeccion estado={estado} resumen={resumenAlerta} />
      </FormularioSeccion>
    </div>
  );
}
