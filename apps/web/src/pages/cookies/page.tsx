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
        <p>Guardamos lo necesario para que la app funcione:</p>
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
          <strong className="text-foreground">Publicidad (Google AdSense)</strong>: en las páginas
          de trayecto mostramos anuncios de Google AdSense. Google y sus socios pueden instalar
          cookies y usar identificadores de dispositivo solo <em>después</em> de tu consentimiento
          (para visitantes de la EEE, Reino Unido y Suiza). Ese consentimiento se recoge con el
          banner de la CMP de Google al entrar:{' '}
          <em>Consentir · No consentir · Gestionar opciones</em>. Si eliges <em>No consentir</em>,
          los anuncios se muestran de forma no personalizada.
        </p>
        <p>
          <strong className="text-foreground">No usamos analítica externa propia</strong> (ni Google
          Analytics ni similares): solo lo necesario para que la app funcione, tal como describe la
          lista de arriba.
        </p>
      </Seccion>

      <Seccion titulo="Consentimiento, anunciantes y afiliados">
        <p>
          El banner de consentimiento (CMP de Google) aparece en tu primera visita y permite
          aceptar, rechazar o ajustar los fines en cualquier momento desde{' '}
          <strong className="text-foreground">«Gestionar opciones»</strong>, que Google añade en la
          propia página mientras la CMP esté activa. Retirar el consentimiento afecta a partir de
          esa misma sesión.
        </p>
        <p>
          Los enlaces de afiliación, cuando existan, abren webs de terceros (Trainline, Omio…) que
          aplican sus propias cookies bajo sus políticas, no las nuestras; se identifican siempre
          como enlace de afiliación.
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
