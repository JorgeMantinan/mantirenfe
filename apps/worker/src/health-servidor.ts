import http from 'node:http';

/**
 * Mini servidor de salud del worker (solo cuando PORT está definido — Render
 * lo asigna al crear el servicio). Dos funciones:
 * 1. El health check de Render (`/health`) cuenta como tráfico y mantiene el
 *    servicio worker despierto en el plan free (si no, se suspendería).
 * 2. Expone la memoria en JSON para diagnosticar los OOM de Render.
 */
export function abrirServicioSalud(
  puerto: number,
  logger: { info: (o: unknown, m: string) => void },
): http.Server {
  const servidor = http.createServer((_req, res) => {
    const m = process.memoryUsage();
    const cuerpo = JSON.stringify({
      servicio: 'worker',
      sano: true,
      timestamp: new Date().toISOString(),
      uptimeMin: Math.round(process.uptime() / 60),
      memoria: {
        rssMb: Math.round(m.rss / 1_048_576),
        heapUsadoMb: Math.round(m.heapUsed / 1_048_576),
        heapTotalMb: Math.round(m.heapTotal / 1_048_576),
      },
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(cuerpo);
  });
  servidor.listen(puerto, () => logger.info({ puerto }, 'Servicio de salud del worker escuchando'));
  return servidor;
}
