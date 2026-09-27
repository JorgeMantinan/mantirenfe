import type { ReactNode } from 'react';
import { PaginaLegal } from '@/components/layout/PaginaLegal';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-lg font-semibold text-foreground">{titulo}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function PaginaCookies() {
  return (
    <PaginaLegal
      titulo="Política de cookies"
      entradilla="Qué almacenamos en tu navegador, para qué y cómo puedes controlarlo."
    >
      <Seccion titulo="Qué son cookies y almacenamiento local">
        <p>
          Las cookies son pequeños archivos que un sitio guarda en tu navegador. El almacenamiento
          local (localStorage) hace lo mismo pero sin enviarlo con cada petición. Ambos sirven para
          recordar cosas entre visitas: tu sesión, tu tema, tus preferencias.
        </p>
      </Seccion>

      <Seccion titulo="Qué usa esta versión">
        <p>
          Esta versión no usa cookies publicitarias ni de terceros. Solo guardamos lo necesario para
          que la app funcione:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-foreground">Sesión de usuario</strong>: Supabase Auth guarda tu
            sesión en localStorage (clave{' '}
            <code className="rounded bg-muted px-1">sb-…-auth-token</code>) para que no tengas que
            iniciar sesión en cada visita. Se borra al cerrar sesión.
          </li>
          <li>
            <strong className="text-foreground">Tema</strong>: la preferencia de claro, oscuro o
            sistema se guarda en localStorage para respetarla la próxima vez que entres.
          </li>
          <li>
            <strong className="text-foreground">Preferencias y notificaciones</strong>: la
            suscripción a avisos push y los ajustes de alertas se asocian a tu cuenta en nuestro
            servidor.
          </li>
          <li>
            <strong className="text-foreground">Caché de la PWA</strong>: el service worker guarda
            los recursos de la app en Cache Storage para que abra rápido y, si proceda, funcione sin
            conexión.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">
            Esta versión aún no carga cookies de terceros de publicidad
          </strong>{' '}
          ni scripts de analítica externa. No hay banner de consentimiento (CMP) porque no hace
          falta todavía.
        </p>
      </Seccion>

      <Seccion titulo="Futuros anunciantes y afiliados">
        <p>
          Si en el futuro se incorporan redes publicitarias, analítica de terceros o scripts de
          afiliados, pediremos tu consentimiento antes de instalarlos y actualizaremos esta
          política. Los enlaces de afiliación, cuando existan, abren webs de terceros (Trainline,
          Omio…) que aplican sus propias cookies bajo sus políticas, no las nuestras.
        </p>
      </Seccion>

      <Seccion titulo="Cómo controlar o borrar lo guardado">
        <p>
          Puedes borrar el almacenamiento de MantiRenfe desde la configuración de tu navegador
          (Borrar datos de navegación → Cookies y datos de sitios web, o datos guardados de
          aplicaciones). También puedes bloquear cookies y localStorage por sitio; si lo haces, la
          sesión y el tema recordado dejarán de funcionar hasta que vuelvas a iniciar sesión.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
