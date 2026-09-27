import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const CLIENTE = (import.meta.env.VITE_ADSENSE_CLIENT ?? '').trim();
const SLOT = (import.meta.env.VITE_ADSENSE_SLOT ?? '').trim();

/**
 * Anuncio de Google AdSense. Solo se pinta si hay cliente y slot
 * configurados (VITE_ADSENSE_CLIENT / VITE_ADSENSE_SLOT en Vercel);
 * sin ellas la página queda exactamente igual que antes.
 */
export function AnuncioAdsense() {
  const empujado = useRef(false);

  useEffect(() => {
    if (!CLIENTE || !SLOT || empujado.current) return;
    const scriptId = 'adsense-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENTE}`;
      document.head.appendChild(script);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      empujado.current = true;
    } catch {
      // Sin conexión o rechazo de AdSense: la página no se rompe
    }
  }, []);

  if (!CLIENTE || !SLOT) return null;

  return (
    <div className="my-5 flex justify-center">
      <ins
        className="adsbygoogle block"
        data-ad-client={CLIENTE}
        data-ad-slot={SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
