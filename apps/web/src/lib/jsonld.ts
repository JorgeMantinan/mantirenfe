import { i18n, type Idioma } from '@/i18n';

/**
 * Datos estructurados Schema.org. Viven aparte de `lib/metas.ts` para que
 * tanto la página de trayecto como la de guía puedan usarlos sin ciclos de
 * importación: aquí no se importa nada más que i18n.
 */

/** Origen canónico del sitio: las URLs absolutas de JSON-LD salen de aquí. */
export const ORIGEN_SITIO = 'https://mantirenfe.vercel.app';

/** `WebSite`: identifica el sitio para los buscadores. */
export function jsonLdSitio(lang: Idioma): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'MantiRenfe',
    url: `${ORIGEN_SITIO}/`,
    inLanguage: lang,
    description: i18n.t('meta.baseDescripcion', { lng: lang }),
  };
}

/** `WebApplication`: la app en sí, gratuita y de viajes. */
export function jsonLdAplicacion(lang: Idioma): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'MantiRenfe',
    url: `${ORIGEN_SITIO}/`,
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Web',
    inLanguage: lang,
    isAccessibleForFree: true,
    description: i18n.t('meta.baseDescripcion', { lng: lang }),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };
}

export interface PasoMigas {
  nombre: string;
  /** Ruta relativa; la última migaja va sin `undefined` (es la página actual). */
  ruta?: string;
}

/** `BreadcrumbList`: jerarquía de la página dentro del sitio. */
export function jsonLdMigas(pasos: PasoMigas[], lang: Idioma): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: pasos.map((paso, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: paso.nombre,
      ...(paso.ruta ? { item: `${ORIGEN_SITIO}${paso.ruta}` } : {}),
    })),
    inLanguage: lang,
  };
}

/**
 * Preguntas frecuentes de `/guia`. Las pinta la página y se serializan como
 * `FAQPage`: una sola fuente de verdad para el texto visible y el JSON-LD.
 */
export function preguntasFrecuentes(lang: Idioma): Array<{ pregunta: string; respuesta: string }> {
  return [
    {
      pregunta: i18n.t('guia.faq1Pregunta', { lng: lang }),
      respuesta: i18n.t('guia.faq1Respuesta', { lng: lang }),
    },
    {
      pregunta: i18n.t('guia.faq2Pregunta', { lng: lang }),
      respuesta: i18n.t('guia.faq2Respuesta', { lng: lang }),
    },
    {
      pregunta: i18n.t('guia.faq3Pregunta', { lng: lang }),
      respuesta: i18n.t('guia.faq3Respuesta', { lng: lang }),
    },
    {
      pregunta: i18n.t('guia.faq4Pregunta', { lng: lang }),
      respuesta: i18n.t('guia.faq4Respuesta', { lng: lang }),
    },
    {
      pregunta: i18n.t('guia.faq5Pregunta', { lng: lang }),
      respuesta: i18n.t('guia.faq5Respuesta', { lng: lang }),
    },
    {
      pregunta: i18n.t('guia.faq6Pregunta', { lng: lang }),
      respuesta: i18n.t('guia.faq6Respuesta', { lng: lang }),
    },
  ];
}

/** `FAQPage` a partir de las preguntas de la guía. */
export function jsonLdFaq(lang: Idioma): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: preguntasFrecuentes(lang).map(({ pregunta, respuesta }) => ({
      '@type': 'Question',
      name: pregunta,
      acceptedAnswer: { '@type': 'Answer', text: respuesta },
    })),
  };
}
