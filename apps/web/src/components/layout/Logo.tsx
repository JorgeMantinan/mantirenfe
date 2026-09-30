import { TrainFront } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function Logo({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  const { t } = useTranslation();

  return (
    <Link
      to="/"
      className={cn('flex items-center gap-2.5', className)}
      aria-label={t('comunes.logoAria')}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <TrainFront className="h-5 w-5" aria-hidden="true" />
      </div>
      {!compacto && (
        <span className="font-heading text-lg font-semibold tracking-tight">
          Manti<span className="text-primary">Renfe</span>
        </span>
      )}
    </Link>
  );
}
