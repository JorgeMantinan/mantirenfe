-- CreateEnum
CREATE TYPE "ProveedorAuth" AS ENUM ('EMAIL', 'GOOGLE', 'MICROSOFT', 'ANONIMO');

-- CreateEnum
CREATE TYPE "EstadoAlerta" AS ENUM ('ACTIVA', 'PAUSA', 'COMPLETADA');

-- CreateEnum
CREATE TYPE "CriterioAlerta" AS ENUM ('DISPONIBILIDAD', 'HORARIO', 'RETRASO', 'APERTURA_VENTA', 'PRECIO');

-- CreateEnum
CREATE TYPE "PlataformaPush" AS ENUM ('WEB', 'ANDROID', 'IOS');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT,
    "avatarUrl" TEXT,
    "proveedor" "ProveedorAuth" NOT NULL DEFAULT 'EMAIL',
    "preferencias" JSONB NOT NULL DEFAULT '{}',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estacion" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alerta" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "origenNombre" TEXT NOT NULL,
    "destinoNombre" TEXT NOT NULL,
    "origenEstacionId" TEXT,
    "destinoEstacionId" TEXT,
    "fechaViaje" DATE NOT NULL,
    "fechaFlexible" BOOLEAN NOT NULL DEFAULT false,
    "fechaDesde" DATE,
    "fechaHasta" DATE,
    "estadoFlexible" JSONB,
    "recurrente" BOOLEAN NOT NULL DEFAULT false,
    "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "soloLaborables" BOOLEAN NOT NULL DEFAULT false,
    "horaDesde" TEXT,
    "horaHasta" TEXT,
    "numeroTren" TEXT,
    "criterio" "CriterioAlerta" NOT NULL DEFAULT 'DISPONIBILIDAD',
    "precioObjetivo" DOUBLE PRECISION,
    "estado" "EstadoAlerta" NOT NULL DEFAULT 'ACTIVA',
    "intervaloSondeoMin" INTEGER NOT NULL DEFAULT 10,
    "bono" TEXT NOT NULL DEFAULT 'GENERAL',
    "notas" TEXT,
    "ultimoEstado" JSONB,
    "ultimoSondeoEn" TIMESTAMP(3),
    "recordatorioEnviadoEn" TIMESTAMP(3),
    "recordatorioTrenesEnviados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "incidenciasNotificadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resumenEnviadoEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioTren" (
    "id" TEXT NOT NULL,
    "alertaId" TEXT NOT NULL,
    "numeroTren" TEXT NOT NULL,
    "salida" TEXT NOT NULL,
    "precioMin" DOUBLE PRECISION,
    "disponible" BOOLEAN NOT NULL,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioTren_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "alertaId" TEXT,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "datos" JSONB,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuscripcionPush" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "plataforma" "PlataformaPush" NOT NULL DEFAULT 'WEB',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuscripcionPush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenPushMovil" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "plataforma" "PlataformaPush" NOT NULL DEFAULT 'ANDROID',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenPushMovil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioTren" (
    "id" TEXT NOT NULL,
    "numeroTren" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "salida" TIMESTAMP(3) NOT NULL,
    "llegada" TIMESTAMP(3) NOT NULL,
    "operador" TEXT,
    "tripId" TEXT,
    "origenEstacionId" TEXT NOT NULL,
    "destinoEstacionId" TEXT NOT NULL,

    CONSTRAINT "HorarioTren_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParadaHorario" (
    "tripId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estacionId" TEXT NOT NULL,
    "llegadaMin" INTEGER,
    "salidaMin" INTEGER,

    CONSTRAINT "ParadaHorario_pkey" PRIMARY KEY ("tripId","orden")
);

-- CreateTable
CREATE TABLE "PosicionTren" (
    "id" TEXT NOT NULL,
    "numeroTren" TEXT,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "velocidadKmh" DOUBLE PRECISION,
    "retrasoSeg" INTEGER,
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosicionTren_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosicionHistorial" (
    "id" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "tripId" TEXT,
    "numeroTren" TEXT,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "retrasoSeg" INTEGER,
    "en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosicionHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incidencia" (
    "id" TEXT NOT NULL,
    "titulo" TEXT,
    "mensaje" TEXT,
    "causa" TEXT,
    "estacionesAfectadas" TEXT[],
    "desde" TIMESTAMP(3),
    "hasta" TIMESTAMP(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incidencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cancelacion" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "numeroTren" TEXT,
    "detectadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cancelacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImpuntualidadTren" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehiculoId" TEXT NOT NULL,
    "numeroTren" TEXT,
    "fecha" DATE NOT NULL,
    "retrasoMaxSeg" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImpuntualidadTren_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Estacion_codigo_key" ON "Estacion"("codigo");

-- CreateIndex
CREATE INDEX "Alerta_usuarioId_estado_idx" ON "Alerta"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "Alerta_estado_ultimoSondeoEn_idx" ON "Alerta"("estado", "ultimoSondeoEn");

-- CreateIndex
CREATE INDEX "Alerta_usuarioId_creadaEn_idx" ON "Alerta"("usuarioId", "creadaEn");

-- CreateIndex
CREATE INDEX "Alerta_fechaViaje_idx" ON "Alerta"("fechaViaje");

-- CreateIndex
CREATE INDEX "PrecioTren_alertaId_registradoEn_idx" ON "PrecioTren"("alertaId", "registradoEn");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leida_creadaEn_idx" ON "Notificacion"("usuarioId", "leida", "creadaEn");

-- CreateIndex
CREATE INDEX "Notificacion_creadaEn_idx" ON "Notificacion"("creadaEn");

-- CreateIndex
CREATE INDEX "Notificacion_alertaId_idx" ON "Notificacion"("alertaId");

-- CreateIndex
CREATE UNIQUE INDEX "SuscripcionPush_endpoint_key" ON "SuscripcionPush"("endpoint");

-- CreateIndex
CREATE INDEX "SuscripcionPush_usuarioId_activa_idx" ON "SuscripcionPush"("usuarioId", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "TokenPushMovil_token_key" ON "TokenPushMovil"("token");

-- CreateIndex
CREATE INDEX "TokenPushMovil_usuarioId_activa_idx" ON "TokenPushMovil"("usuarioId", "activa");

-- CreateIndex
CREATE INDEX "HorarioTren_fecha_origenEstacionId_idx" ON "HorarioTren"("fecha", "origenEstacionId");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioTren_numeroTren_fecha_origenEstacionId_salida_key" ON "HorarioTren"("numeroTren", "fecha", "origenEstacionId", "salida");

-- CreateIndex
CREATE INDEX "ParadaHorario_estacionId_tripId_idx" ON "ParadaHorario"("estacionId", "tripId");

-- CreateIndex
CREATE INDEX "PosicionTren_actualizadaEn_idx" ON "PosicionTren"("actualizadaEn");

-- CreateIndex
CREATE INDEX "PosicionHistorial_vehiculoId_en_idx" ON "PosicionHistorial"("vehiculoId", "en");

-- CreateIndex
CREATE INDEX "PosicionHistorial_vehiculoId_tripId_en_idx" ON "PosicionHistorial"("vehiculoId", "tripId", "en");

-- CreateIndex
CREATE INDEX "PosicionHistorial_en_idx" ON "PosicionHistorial"("en");

-- CreateIndex
CREATE INDEX "Incidencia_activa_idx" ON "Incidencia"("activa");

-- CreateIndex
CREATE INDEX "Cancelacion_fecha_idx" ON "Cancelacion"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Cancelacion_tripId_fecha_key" ON "Cancelacion"("tripId", "fecha");

-- CreateIndex
CREATE INDEX "ImpuntualidadTren_fecha_idx" ON "ImpuntualidadTren"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ImpuntualidadTren_tripId_fecha_key" ON "ImpuntualidadTren"("tripId", "fecha");

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_origenEstacionId_fkey" FOREIGN KEY ("origenEstacionId") REFERENCES "Estacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alerta" ADD CONSTRAINT "Alerta_destinoEstacionId_fkey" FOREIGN KEY ("destinoEstacionId") REFERENCES "Estacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioTren" ADD CONSTRAINT "PrecioTren_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "Alerta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "Alerta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuscripcionPush" ADD CONSTRAINT "SuscripcionPush_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenPushMovil" ADD CONSTRAINT "TokenPushMovil_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTren" ADD CONSTRAINT "HorarioTren_origenEstacionId_fkey" FOREIGN KEY ("origenEstacionId") REFERENCES "Estacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioTren" ADD CONSTRAINT "HorarioTren_destinoEstacionId_fkey" FOREIGN KEY ("destinoEstacionId") REFERENCES "Estacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParadaHorario" ADD CONSTRAINT "ParadaHorario_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

