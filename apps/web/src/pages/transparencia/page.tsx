import type { ReactNode } from 'react';
import { PaginaLegal } from '@/components/layout/PaginaLegal';
import { enlaces, hayAfiliacion, hayDonaciones } from '@/lib/monetizacion';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function PaginaTransparencia() {
  return (
    <PaginaLegal
      titulo="Transparencia"
      entradilla="Qué es MantiRenfe, de dónde vienen los datos y cómo se financia el proyecto."
    >
      <Seccion titulo="Quiénes somos">
        <p>
          <strong className="text-foreground">MantiRenfe</strong> es un proyecto independiente, sin
          ánimo de lucro de persona o equipo particular. No estamos afiliados, patrocinados,
          respaldados ni gestionados por Renfe Operadora, Adif, Ouigo, Iryo ni ningún otro operador
          ferroviario.
        </p>
        <p>
          <strong className="text-foreground">No somos un sitio oficial de Renfe</strong> ni
          sustituimos a venta.renfe.com: te ayudamos a vigilar disponibilidad, horarios y estado de
          la red, pero la compra de billetes se hace siempre en la web o app de cada operador.
        </p>
      </Seccion>

      <Seccion titulo="Cómo se financia">
        <p>El proyecto no cobra a sus usuarios. Sus vías de financiación son estas dos:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Enlaces de afiliación</strong>: cuando se muestran,
            van a servicios de compra de billetes externos. Si compras a través de ellos, podemos
            recibir una comisión <em>sin coste extra para ti</em>. No condicionan los resultados que
            mostramos: los horarios, precios y avisos salen de los datos de Renfe, no de quién paga.
          </li>
          <li>
            <strong className="text-foreground">Donaciones</strong>: aportaciones voluntarias
            (cuando el canal está abierto) para cubrir servidores, dominio y horas de mantenimiento.
            Las donaciones sostienen el proyecto independiente.
          </li>
        </ul>
        <p>Estado actual de la monetización:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {hayAfiliacion
              ? `Enlaces de afiliación activos: ${enlaces.map((e) => e.nombre).join(', ')}.`
              : 'Sin enlaces de afiliación activos por ahora.'}
          </li>
          <li>
            {hayDonaciones
              ? 'Canal de donaciones abierto desde el pie de la landing.'
              : 'Sin canal de donaciones abierto por ahora.'}
          </li>
          <li>Sin publicidad de terceros, sin venta de datos y sin patrocinios.</li>
        </ul>
      </Seccion>

      <Seccion titulo="Fuentes de datos">
        <p>
          <strong className="text-foreground">Origen de los datos: Renfe Operadora</strong> a través
          de su programación abierta (open data): ficheros GTFS estáticos de horarios y estaciones,
          y feeds GTFS-Realtime de posiciones, retrasos e incidencias, publicados bajo licencia
          CC-BY 4.0.
        </p>
        <p>
          Nuestro worker sincroniza esos ficheros de forma periódica para mantener los horarios y
          las posiciones al día. Los datos de disponibilidad de asientos proceden de la venta de
          Renfe cuando están disponibles.
        </p>
        <p>
          Las marcas «Renfe», «Adif», «Ouigo» e «Iryo» pertenecen a sus respectivos titulares y se
          citan solo con fines informativos.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
