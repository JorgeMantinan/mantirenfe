import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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

export function PaginaRegistro() {
  const { t } = useTranslation();
  const { registrarse, entrarConGoogle, entrarConMicrosoft, user, cargando, authConfigurada } =
    useAuth();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  if (!cargando && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      toast.error(t('registro.errorCampos'));
      return;
    }
    if (password.length < 8) {
      toast.error(t('registro.errorPassword'));
      return;
    }
    if (password !== password2) {
      toast.error(t('registro.errorIguales'));
      return;
    }
    setEnviando(true);
    try {
      const pendienteConfirmacion = await registrarse(email.trim(), password, nombre.trim());
      toast.success(pendienteConfirmacion ? t('registro.creadaConfirmar') : t('registro.creada'));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? errorAuth(error.message) : t('registro.errorGenerico'));
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
          <CardTitle className="text-2xl">{t('registro.titulo')}</CardTitle>
          <CardDescription>{t('registro.descripcion')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!authConfigurada ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              {t('registro.configAntes')}
              <code>.env</code>
              {t('registro.configDespues')}
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Button variant="outline" onClick={() => void oauth('google')}>
                  <GoogleIcon /> {t('registro.google')}
                </Button>
                <Button variant="outline" onClick={() => void oauth('microsoft')}>
                  <MicrosoftIcon /> {t('registro.microsoft')}
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
                  <Label htmlFor="nombre">{t('registro.nombre')}</Label>
                  <Input
                    id="nombre"
                    autoComplete="name"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder={t('registro.nombrePlaceholder')}
                  />
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor="password">{t('form.contrasena')}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">{t('registro.repetir')}</Label>
                  <Input
                    id="password2"
                    type="password"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? t('registro.creando') : t('registro.crear')}
                </Button>
              </form>
            </>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {t('registro.yaCuenta')}{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t('registro.iniciaSesion')}
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
