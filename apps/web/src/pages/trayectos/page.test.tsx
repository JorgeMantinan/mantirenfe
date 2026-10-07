import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { i18n } from '@/i18n';
import { en } from '@/i18n/en';
import { PaginaTrayecto, PaginaTrayectos } from './page';
import { esRutaTrayecto, metaTrayecto, metaTrayectos, rutaEnIdioma } from '@/lib/trayectos-i18n';
import { fechaLarga } from '@/lib/trayectos';

// En producción el diccionario EN se descarga con `import()`; aquí se registra
// estáticamente para poder pintar rutas /en/... sin esperar a esa carga.
i18n.addResourceBundle('en', 'translation', en, true, true);

function renderDetalle(ruta: string, hijo: ReactElement) {
  return renderToString(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/en/trayectos/:origenSlug/:destinoSlug" element={hijo} />
        <Route path="/trayectos/:origenSlug/:destinoSlug" element={hijo} />
      </Routes>
    </MemoryRouter>,
  );
}

function render(ruta: string, hijo: ReactElement) {
  return renderToString(<MemoryRouter initialEntries={[ruta]}>{hijo}</MemoryRouter>);
}

describe('paginas de trayecto EN', () => {
  it('detalle EN', () => {
    const html = renderDetalle('/en/trayectos/a-coruna/vigo', <PaginaTrayecto lang="en" />);
    expect(html).toContain('Trains from A Coruna to Vigo');
    expect(html).toContain('Train schedule for');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/trayectos/a-coruna/vigo"');
    expect(html).toContain('href="/en/trayectos/a-coruna/vigo"');
  });

  it('detalle ES sin prefijo', () => {
    const html = renderDetalle('/trayectos/madrid/barcelona', <PaginaTrayecto />);
    expect(html).toContain('Horarios de Madrid a Barcelona');
    expect(html).toContain('href="/trayectos/madrid/barcelona"');
    expect(html).toContain('href="/en/trayectos/madrid/barcelona"');
  });

  it('listado EN', () => {
    const html = render('/en/trayectos', <PaginaTrayectos lang="en" />);
    expect(html).toContain('Train schedules by route');
    expect(html).toContain('Popular routes');
    expect(html).toContain('href="/en/trayectos/madrid/barcelona"');
    expect(html).toContain('Your journey');
  });

  it('meta', () => {
    const en = metaTrayecto('en', 'A Coruña', 'Vigo', '/en/trayectos/a-coruna/vigo');
    expect(en.titulo).toBe(
      `Trains from A Coruña to Vigo – timetable ${new Date().getFullYear()} | MantiRenfe`,
    );
    expect(en.alternate).toEqual({ hreflang: 'es', href: '/trayectos/a-coruna/vigo' });
    expect(en.lang).toBe('en');

    const es = metaTrayecto('es', 'A Coruña', 'Vigo', '/trayectos/a-coruna/vigo');
    expect(es.alternate).toEqual({ hreflang: 'en', href: '/en/trayectos/a-coruna/vigo' });

    expect(metaTrayectos('en').alternate).toEqual({ hreflang: 'es', href: '/trayectos' });
    expect(metaTrayectos('es').alternate).toEqual({ hreflang: 'en', href: '/en/trayectos' });
  });

  it('toggle de idioma', () => {
    expect(rutaEnIdioma('/en/trayectos/a-coruna/vigo', 'es')).toBe('/trayectos/a-coruna/vigo');
    expect(rutaEnIdioma('/trayectos/a-coruna/vigo', 'en')).toBe('/en/trayectos/a-coruna/vigo');
    expect(rutaEnIdioma('/en/trayectos', 'es')).toBe('/trayectos');
    expect(esRutaTrayecto('/trayectos')).toBe(true);
    expect(esRutaTrayecto('/en/trayectos/madrid/vigo')).toBe(true);
    expect(esRutaTrayecto('/trenes')).toBe(false);
    expect(esRutaTrayecto('/en/trenes')).toBe(false);
  });

  it('fecha en en-GB', () => {
    expect(fechaLarga('2026-09-28', 'en')).toContain('28 September 2026');
    expect(fechaLarga('2026-09-28', 'es')).toContain('28 de septiembre de 2026');
  });
});
