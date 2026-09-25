import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { traducirErrorAuth } from '@mantirenfe/shared-types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/layout/Logo';

export function PaginaRecuperarPassword() {
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
      toast.error('Introduce tu email');
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
      toast.success(
        'Si existe una cuenta con ese email, te hemos enviado un enlace para cambiar la contraseña.',
      );
      setEmail('');
    } catch (error) {
      toast.error(error instanceof Error ? traducirErrorAuth(error.message) : 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  const cambiarPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      toast.success('Contraseña actualizada. Ya puedes entrar.');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? traducirErrorAuth(error.message) : 'No se pudo actualizar',
      );
    } finally {
      setEnviando(false);
    }
  };

  if (!cargando && !authConfigurada) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Autenticación no configurada</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!cargando && user && !conSesion) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="space-y-3 text-center">
          <div className="flex justify-center">
            <Logo />
          </div>
          <CardTitle className="text-2xl">
            {conSesion ? 'Elige una contraseña nueva' : 'Recuperar contraseña'}
          </CardTitle>
          <CardDescription>
            {conSesion
              ? 'Esta es tu nueva contraseña de acceso'
              : 'Te enviaremos un enlace para crear una nueva'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conSesion ? (
            <form onSubmit={cambiarPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? 'Guardando...' : 'Guardar contraseña'}
              </Button>
            </form>
          ) : (
            <form onSubmit={enviarEnlace} className="space-y-4">
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
              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? 'Enviando...' : 'Enviar enlace de recuperación'}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">
              ← Volver a iniciar sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
