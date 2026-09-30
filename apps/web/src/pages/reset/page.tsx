import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/layout/Logo';
import { SelectorIdioma } from '@/components/SelectorIdioma';
import { errorAuth } from '@/i18n/errores-auth';

export function PaginaRecuperarPassword() {
  const { t } = useTranslation();
  const { user, cargando, authConfigurada } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  // Modo 1: enlace de recuperación abierto (ya hay sesión de recovery)
  const conSesion = Boolean(user);

  const enviarEnlace = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (!email.trim()) {
      toast.error(t('reset.errorEmail'));
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
      toast.success(t('reset.enviadoOk'));
      setEmail('');
    } catch (error) {
      toast.error(error instanceof Error ? errorAuth(error.message) : t('reset.errorEnvio'));
    } finally {
      setEnviando(false);
    }
  };

  const cambiarPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      toast.error(t('registro.errorPassword'));
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      toast.success(t('reset.okPassword'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? errorAuth(error.message) : t('reset.errorActualizar'));
    } finally {
      setEnviando(false);
    }
  };

  if (!cargando && !authConfigurada) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('reset.noConfig')}</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!cargando && user && !conSesion) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="absolute right-4 top-4">
        <SelectorIdioma />
      </div>
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <CardTitle className="text-2xl">
            {conSesion ? t('reset.tituloNueva') : t('reset.tituloEnlace')}
          </CardTitle>
          <CardDescription>
            {conSesion ? t('reset.descNueva') : t('reset.descEnlace')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conSesion ? (
            <form onSubmit={cambiarPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('reset.nueva')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? t('reset.guardando') : t('reset.guardar')}
              </Button>
            </form>
          ) : (
            <form onSubmit={enviarEnlace} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('form.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('form.emailPlaceholder')}
                />
              </div>
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? t('reset.enviando') : t('reset.enviar')}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t('reset.volverLogin')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
