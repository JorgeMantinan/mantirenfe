import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
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

export function PaginaRegistro() {
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
      toast.error('Nombre y email son obligatorios');
      return;
    }
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== password2) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setEnviando(true);
    try {
      await registrarse(email.trim(), password, nombre.trim());
      toast.success('Cuenta creada. Revisa tu email si pide confirmación.');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? traducirErrorAuth(error.message) : 'No se pudo crear la cuenta',
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
          <CardTitle className="text-2xl">Crea tu cuenta</CardTitle>
          <CardDescription>Alertas personalizadas en menos de un minuto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!authConfigurada ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              Configura Supabase en <code>.env</code> para habilitar el registro.
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Button variant="outline" onClick={() => void oauth('google')}>
                  <GoogleIcon /> Registrarme con Google
                </Button>
                <Button variant="outline" onClick={() => void oauth('microsoft')}>
                  <MicrosoftIcon /> Registrarme con Outlook
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
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    autoComplete="name"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ana Viajera"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Repetir contraseña</Label>
                  <Input
                    id="password2"
                    type="password"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => setPassword2(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
                </Button>
              </form>
            </>
          )}
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Inicia sesión
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
