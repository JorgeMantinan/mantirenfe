import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { traducirErrorAuth } from '@mantirenfe/shared-types';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/layout/Logo';
import { SelectorIdioma } from '@/components/SelectorIdioma';
import { GoogleIcon, MicrosoftIcon } from '@/components/ui/marcas-svg';
import { errorAuth } from '@/i18n/errores-auth';
import { rutaSegura } from '@/lib/rutas';

export function PaginaLogin() {
  const { t } = useTranslation();
  const { entrar, entrarConGoogle, entrarConMicrosoft, user, cargando, authConfigurada } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Solo rutas internas: «?redirect=» no debe poder sacar del sitio
  const redirect = rutaSegura(params.get('redirect'));

  if (!cargando && user) {
    return <Navigate to={redirect} replace />;
  }

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast.error(t('login.errorCampos'));
      return;
    }
    setEnviando(true);
    try {
      await entrar(email.trim(), password);
      toast.success(t('login.bienvenido'));
      navigate(redirect, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? errorAuth(error.message) : t('login.errorGenerico'));
    } finally {
      setEnviando(false);
    }
  };

  const oauth = async (proveedor: 'google' | 'microsoft') => {
    try {
      if (proveedor === 'google') await entrarConGoogle();
      else await entrarConMicrosoft();
    } catch (error) {
      toast.error(error instanceof Error ? errorAuth(error.message) : t('login.errorProveedor'));
    }
  };

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
          <CardTitle className="text-2xl">{t('login.titulo')}</CardTitle>
          <CardDescription>{t('login.descripcion')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!authConfigurada ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {t('login.configAntes')}
              <code>VITE_SUPABASE_URL</code>
              {t('login.configEntre')}
              <code>VITE_SUPABASE_ANON_KEY</code>
              {t('login.configMedio')}
              <code>.env</code>
              {t('login.configDespues')}
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Button variant="outline" onClick={() => void oauth('google')}>
                  <GoogleIcon /> {t('login.google')}
                </Button>
                <Button variant="outline" onClick={() => void oauth('microsoft')}>
                  <MicrosoftIcon /> {t('login.microsoft')}
                </Button>
              </div>
              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  {t('login.oEmail')}
                </span>
              </div>
              <form onSubmit={enviar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('form.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t('form.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('form.contrasena')}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? t('login.enviando') : t('login.entrar')}
                </Button>
              </form>
              <p className="text-center text-sm">
                <Link to="/reset-password" className="font-medium text-primary hover:underline">
                  {t('login.olvidaste')}
                </Link>
              </p>
            </>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {t('login.sinCuenta')}{' '}
            <Link to="/registro" className="font-medium text-primary hover:underline">
              {t('login.registrate')}
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">
              ← {t('comunes.volverInicio')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
