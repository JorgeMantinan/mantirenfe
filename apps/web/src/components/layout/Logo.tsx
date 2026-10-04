import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * Etiqueta "train-front" a fuego: es la marca de la app (web y móvil) y se
 * incrusta en línea en vez de usar lucide-react para garantizar el trazo
 * idéntico en todas partes.
 */
export function TrainFrontSvg({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide lucide-train-front h-5 w-5', className)}
      aria-hidden="true"
    >
      <path d="M8 3.1V7a4 4 0 0 0 8 0V3.1" />
      <path d="m9 15-1-1" />
      <path d="m15 15 1-1" />
      <path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z" />
      <path d="m8 19-2 3" />
      <path d="m16 19 2 3" />
    </svg>
  );
}

export function Logo({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  const { t } = useTranslation();

  return (
    <Link
      to="/"
      className={cn('flex items-center gap-2.5', className)}
      aria-label={t('comunes.logoAria')}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <TrainFrontSvg />
      </div>
      {!compacto && (
        <span className="font-heading text-lg font-semibold tracking-tight">
          Manti<span className="text-primary">Renfe</span>
        </span>
      )}
    </Link>
  );
}
