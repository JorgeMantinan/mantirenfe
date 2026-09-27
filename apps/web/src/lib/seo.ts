export interface MetaPagina {
  titulo: string;
  descripcion: string;
  /** Ruta relativa, p. ej. "/trayectos/madrid/barcelona" */
  canonical?: string;
}

type Restauracion = () => void;

function fijarMeta(atributo: 'name' | 'property', clave: string, contenido: string): Restauracion {
  const existente = document.head.querySelector<HTMLMetaElement>(`meta[${atributo}="${clave}"]`);
  const contenidoPrevio = existente?.getAttribute('content') ?? null;
  const elemento = existente ?? document.createElement('meta');
  if (!existente) {
    elemento.setAttribute(atributo, clave);
    document.head.appendChild(elemento);
  }
  elemento.setAttribute('content', contenido);
  return () => {
    if (contenidoPrevio === null) {
      elemento.remove();
    } else {
      elemento.setAttribute('content', contenidoPrevio);
    }
  };
}

function fijarCanonical(href: string): Restauracion {
  const existente = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const hrefPrevio = existente?.getAttribute('href') ?? null;
  const elemento = existente ?? document.createElement('link');
  if (!existente) {
    elemento.setAttribute('rel', 'canonical');
    document.head.appendChild(elemento);
  }
  elemento.setAttribute('href', href);
  return () => {
    if (hrefPrevio === null) {
      elemento.remove();
    } else {
      elemento.setAttribute('href', hrefPrevio);
    }
  };
}

/**
 * Meta tags dinámicos de las páginas SEO (SPA: no hay render en servidor).
 * Crea los tags si no existen y devuelve una función que restaura el estado
 * anterior para no arrastrar títulos al navegar a otra página.
 */
export function aplicarMetaPagina(meta: MetaPagina): () => void {
  const tituloPrevio = document.title;
  const langPrevio = document.documentElement.lang;

  document.title = meta.titulo;
  document.documentElement.lang = 'es';

  const restauraciones: Restauracion[] = [
    fijarMeta('name', 'description', meta.descripcion),
    fijarMeta('property', 'og:title', meta.titulo),
    fijarMeta('property', 'og:description', meta.descripcion),
  ];
  if (meta.canonical) {
    restauraciones.push(fijarCanonical(new URL(meta.canonical, window.location.origin).href));
  }

  return () => {
    document.title = tituloPrevio;
    document.documentElement.lang = langPrevio;
    for (const restaurar of restauraciones) restaurar();
  };
}
