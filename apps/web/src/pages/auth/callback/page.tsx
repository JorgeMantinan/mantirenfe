import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { canjearCodigoConCookie, leerCodeVerifierPkce, supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';

export function PaginaAuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recargarSesion } = useAuth();
  // El canje del código es de un solo uso: en StrictMode el efecto corre dos
  // veces y un segundo intento quemaría el código con error molesto.
  const canjeado = useRef(false);

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
      void recargarSesion().then((haySesion) =>
        navigate(haySesion ? '/dashboard' : '/login', { replace: true }),
      );
      return;
    }

    if (canjeado.current) return;
    canjeado.current = true;

    void (async () => {
      // 1) BFF con cookie: se canjea el código contra la API con el verifier
      //    que supabase-js guardó en el storage (la sesión NO toca
      //    localStorage: el access token se queda en memoria y, al aplicar la
      //    cookie en recargarSesion(), se limpia la clave legada — B6).
      const verifier = leerCodeVerifierPkce();
      if (verifier) {
        const cookie = await canjearCodigoConCookie(codigo, verifier);
        if (cookie.ok) {
          await recargarSesion();
          navigate('/dashboard', { replace: true });
          return;
        }
      }
      // 2) Fallback: el flujo de siempre con supabase-js (PKCE en storage)
      const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        // El código puede haber sido ya consumido al cargar la app (supabase-js
        // auto-detecta el callback con detectSessionInUrl): si YA hay sesión,
        // no hay nada que canjear y se continúa sin toast de error.
        if (await recargarSesion()) {
          navigate('/dashboard', { replace: true });
          return;
        }
        toast.error(error.message);
        navigate('/login', { replace: true });
        return;
      }
      navigate('/dashboard', { replace: true });
    })();
  }, [navigate, recargarSesion]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-sm text-muted-foreground">{t('callback.texto')}</p>
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
