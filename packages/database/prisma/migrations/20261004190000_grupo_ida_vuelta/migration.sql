ALTER TABLE "Alerta" ADD COLUMN "grupoId" TEXT;

-- Indice para buscar la vuelja de un ancla (y al reves).
CREATE INDEX "Alerta_grupoId_idx" ON "Alerta"("grupoId");
