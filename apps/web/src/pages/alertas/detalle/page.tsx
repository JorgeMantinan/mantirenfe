import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AlertaResponse, NotificacionResponse } from '@mantirenfe/shared-types';

export function PaginaDetalleAlerta() {
  const { id } = useParams<{ id: string }>();
  const [alerta, setAlerta] = useState<AlertaResponse | null>(null);
  const [avisos, setAvisos] = useState<NotificacionResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    if (!id) return;
    setCargando(true);
    Promise.all([
      api<AlertaResponse>(`/alertas/${id}`),
      api<NotificacionResponse[]>('/notificaciones'),
    ])
      .then(([a, todas]) => {
        setAlerta(a);
        setAvisos(todas.filter((n) => n.alertaId === id));
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false));
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/alertas">
            <ArrowLeft aria-hidden="true" /> Volver a mis alertas
          </Link>
        </Button>
        <h1 className="font-heading text-3xl font-bold tracking-tight">Detalle de la alerta</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {error}
        </div>
      )}

      {cargando ? (
        <>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </>
      ) : (
        alerta && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <BellRing className="h-5 w-5 text-primary" aria-hidden="true" />
                  {alerta.origenNombre} → {alerta.destinoNombre}
                </CardTitle>
                <CardDescription>
                  {alerta.fechaViaje} ·{' '}
                  {alerta.horaDesde || alerta.horaHasta
                    ? `${alerta.horaDesde ?? '00:00'} – ${alerta.horaHasta ?? '23:59'}`
                    : 'todo el día'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-sm">
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
                <Badge variant="outline">cada {alerta.intervaloSondeoMin} min</Badge>
                <Badge variant="outline">{alerta.bono}</Badge>
                {alerta.numeroTren && <Badge variant="outline">tren {alerta.numeroTren}</Badge>}
                <span className="text-muted-foreground">
                  Último sondeo:{' '}
                  {alerta.ultimoSondeoEn
                    ? new Date(alerta.ultimoSondeoEn).toLocaleString('es-ES')
                    : 'ninguno'}
                </span>
              </CardContent>
              {alerta.notas && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  Notas: {alerta.notas}
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Avisos de esta alerta</CardTitle>
                <CardDescription>Historial de notificaciones que hemos enviado</CardDescription>
              </CardHeader>
              <CardContent>
                {avisos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hemos enviado avisos para esta alerta.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {avisos.map((aviso) => (
                      <li key={aviso.id} className="space-y-1 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{aviso.titulo}</p>
                          {!aviso.leida && <Badge variant="destructive">Nuevo</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{aviso.cuerpo}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(aviso.creadaEn).toLocaleString('es-ES')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
