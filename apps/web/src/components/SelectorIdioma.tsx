import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IDIOMAS, cambiarIdioma, esRutaTrayecto, rutaEnIdioma, type Idioma } from '@/i18n';

/**
 * Selector ES|EN del idioma global (i18next). Se guarda en
 * `localStorage['idioma']` y, si la ruta actual es de trayecto (las únicas
 * bilingües por URL), navega además a la ruta gemela para que URL, hreflang e
 * idioma sigan mandando el mismo mensaje a Google.
 */
export function SelectorIdioma() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const actual: Idioma = i18n.language === 'en' ? 'en' : 'es';

  const elegir = (lang: Idioma) => {
    cambiarIdioma(lang);
    if (esRutaTrayecto(pathname)) {
      const ruta = rutaEnIdioma(pathname, lang);
      if (ruta !== pathname) navigate(ruta);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2"
          aria-label={t('cabecera.cambiarIdioma')}
          title={t('cabecera.cambiarIdioma')}
        >
          <span className="text-xs font-semibold tracking-wide">{actual.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('selectorIdioma.titulo')}</DropdownMenuLabel>
        {IDIOMAS.map((lang) => (
          <DropdownMenuItem
            key={lang}
            onClick={() => elegir(lang)}
            title={lang === actual ? t('selectorIdioma.actual') : undefined}
          >
            <span className={lang === actual ? 'font-semibold' : undefined}>
              {lang === 'es' ? t('selectorIdioma.es') : t('selectorIdioma.en')}
            </span>
            {lang === actual && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
