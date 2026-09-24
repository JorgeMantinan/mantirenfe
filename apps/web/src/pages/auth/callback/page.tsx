import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';

export function PaginaAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!supabase) {
      navigate('/login', { replace: true });
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
        <p className="text-center text-sm text-muted-foreground">Completando inicio de sesión…</p>
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
