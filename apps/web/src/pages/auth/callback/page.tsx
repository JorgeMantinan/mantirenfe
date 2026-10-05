import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';

export function PaginaAuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) {
      navigate('/login', { replace: true });
      return;
    }

    // Supabase exige `code` + `code_verifier`: una doble visita, un enlace
    // antiguo o una sesión ya abierta llegan SIN código y el intercambio
    // revienta con "both auth code and code verifier should be non-empty".
    const codigo = new URLSearchParams(window.location.search).get('code');
    if (!codigo) {
      void supabase.auth
        .getSession()
        .then(({ data }) => navigate(data.session ? '/dashboard' : '/login', { replace: true }))
        .catch(() => navigate('/login', { replace: true }));
      return;
    }

    void supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
      if (error) {
        toast.error(error.message);
        navigate('/login', { replace: true });
        return;
      }
      navigate('/dashboard', { replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-sm text-muted-foreground">{t('callback.texto')}</p>
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
