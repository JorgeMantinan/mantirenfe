import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { traducirErrorAuth } from '@mantirenfe/shared-types';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/layout/Logo';
import { GoogleIcon, MicrosoftIcon } from '@/components/ui/marcas-svg';

export function PaginaLogin() {
  const { entrar, entrarConGoogle, entrarConMicrosoft, user, cargando, authConfigurada } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  if (!cargando && user) {
    return <Navigate to={redirect} replace />;
  }

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Introduce email y contraseña');
      return;
    }
    setEnviando(true);
    try {
      await entrar(email.trim(), password);
      toast.success('¡Bienvenido de nuevo!');
      navigate(redirect, { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? traducirErrorAuth(error.message) : 'No se pudo iniciar sesión',
      );
    } finally {
      setEnviando(false);
    }
  };

  const oauth = async (proveedor: 'google' | 'microsoft') => {
    try {
      if (proveedor === 'google') await entrarConGoogle();
      else await entrarConMicrosoft();
    } catch (error) {
      toast.error(
        error instanceof Error ? traducirErrorAuth(error.message) : 'Error con el proveedor',
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <CardTitle className="text-2xl">Inicia sesión</CardTitle>
          <CardDescription>Accede a tus alertas y notificaciones</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!authConfigurada ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>{' '}
              en el archivo <code>.env</code>. Crea el proyecto en Supabase y habilita los
              proveedores Google / Microsoft en Authentication → Providers.
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Button variant="outline" onClick={() => void oauth('google')}>
                  <GoogleIcon /> Continuar con Google
                </Button>
                <Button variant="outline" onClick={() => void oauth('microsoft')}>
                  <MicrosoftIcon /> Continuar con Outlook / Microsoft
                </Button>
              </div>
              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                  o con email
                </span>
              </div>
              <form onSubmit={enviar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            </>
          )}
          <p className="text-center text-sm text-muted-foreground">
            ¿Aún no tienes cuenta?{' '}
            <Link to="/registro" className="font-medium text-primary hover:underline">
              Regístrate
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">
              ← Volver al inicio
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
