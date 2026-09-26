import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BellRing, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AlertaResponse } from '@mantirenfe/shared-types';

export function PaginaAlertas() {
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState<AlertaResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<AlertaResponse | null>(null);

  const cargar = useCallback(() => {
    api<AlertaResponse[]>('/alertas')
      .then(setAlertas)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alternarEstado = async (alerta: AlertaResponse) => {
    const nuevo = alerta.estado === 'ACTIVA' ? 'PAUSA' : 'ACTIVA';
    try {
      await api(`/alertas/${alerta.id}`, { method: 'PATCH', json: { estado: nuevo } });
      toast.success(nuevo === 'ACTIVA' ? 'Alerta reanudada' : 'Alerta en pausa');
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  };

  const eliminar = async () => {
    if (!eliminando) return;
    try {
      await api(`/alertas/${eliminando.id}`, { method: 'DELETE' });
      toast.success('Alerta eliminada');
      setEliminando(null);
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Mis alertas</h1>
          <p className="text-muted-foreground">Trayectos vigilados y su estado de sondeo</p>
        </div>
        <Button asChild>
          <Link to="/alertas/nueva">
            <Plus aria-hidden="true" /> Nueva alerta
          </Link>
        </Button>
      </div>

      {alertas === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : alertas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BellRing className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <p className="font-heading text-lg font-semibold">Aún no tienes alertas</p>
              <p className="text-sm text-muted-foreground">
                Crea una para tu próximo viaje y te avisaremos si se libera plaza.
              </p>
            </div>
            <Button asChild>
              <Link to="/alertas/nueva">
                <Plus aria-hidden="true" /> Crear la primera
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alertas.map((alerta) => (
            <Card key={alerta.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="space-y-1">
                  <p className="font-heading text-lg font-semibold">
                    {alerta.origenNombre}{' '}
                    <span className="text-primary" aria-hidden="true">
                      →
                    </span>{' '}
                    {alerta.destinoNombre}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {alerta.fechaViaje} ·{' '}
                    {alerta.horaDesde && alerta.horaHasta
                      ? `${alerta.horaDesde} – ${alerta.horaHasta}`
                      : alerta.horaDesde
                        ? `desde ${alerta.horaDesde}`
                        : 'todo el día'}{' '}
                    · cada {alerta.intervaloSondeoMin} min · bono {alerta.bono}
                  </p>
                  {alerta.ultimoSondeoEn && (
                    <p className="text-xs text-muted-foreground">
                      Último sondeo: {new Date(alerta.ultimoSondeoEn).toLocaleString('es-ES')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      alerta.estado === 'ACTIVA'
                        ? 'exito'
                        : alerta.estado === 'PAUSA'
                          ? 'aviso'
                          : 'secondary'
                    }
                  >
                    {alerta.estado === 'ACTIVA'
                      ? 'Activa'
                      : alerta.estado === 'PAUSA'
                        ? 'En pausa'
                        : 'Completada'}
                  </Badge>
                  <Badge variant="outline">{alerta.criterio}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void alternarEstado(alerta)}
                    disabled={alerta.estado === 'COMPLETADA'}
                  >
                    {alerta.estado === 'ACTIVA' ? (
                      <>
                        <Pause aria-hidden="true" /> Pausar
                      </>
                    ) : (
                      <>
                        <Play aria-hidden="true" /> Reanudar
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/alertas/nueva?editar=${alerta.id}`)}
                  >
                    <Pencil aria-hidden="true" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => setEliminando(alerta)}
                    aria-label="Eliminar alerta"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!eliminando} onOpenChange={(abierto) => !abierto && setEliminando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar esta alerta?</DialogTitle>
            <DialogDescription>
              Se dejará de vigilar {eliminando?.origenNombre} → {eliminando?.destinoNombre} el{' '}
              {eliminando?.fechaViaje}. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminando(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void eliminar()}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
