import Trenes from './trenes';

/**
 * «Buscar mi tren» (pestaña propia): el buscador de horarios con la fecha en
 * calendario, la franja desde/hasta con reloj y el panel de plazas y precio.
 */
export default function Buscar() {
  return <Trenes modoInicial="horarios" />;
}
