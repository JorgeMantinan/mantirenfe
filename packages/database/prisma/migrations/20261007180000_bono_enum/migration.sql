-- Cambio 1: Alerta.bono TEXT -> enum "BonoAlerta".
--
-- Diagnóstico previo (2026-10-07):
--   SELECT bono, count(*) FROM "Alerta" GROUP BY 1  ->  solo 'GENERAL' (9/9 filas),
--   todos dentro de la tupla BONOS (packages/shared-types/src/constantes.ts).
--
-- El nombre del tipo se alinea con lo que imprime Prisma:
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
--   -> CREATE TYPE "BonoAlerta" AS ENUM (...)
--
-- Nota de aplicacion: `prisma db push` / `migrate diff --from-schema-datasource`
-- proponen DROP COLUMN + ADD COLUMN para este cambio (no hay cast registrado
-- text -> enum), lo que borraria los valores existentes. Se aplica aqui el cast
-- explicito USING, que conserva las filas y deja EXACTAMENTE el mismo estado
-- final que pide el schema. Verificado con
--   prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ...
-- (debe quedar vacio tras aplicar).

-- CreateEnum
CREATE TYPE "BonoAlerta" AS ENUM ('GENERAL', 'BONO_10', 'BONO_20', 'JUVENIL', 'ESTUDIANTE', 'DISCAPACIDAD', 'FAMILIA_NUMEROSA', 'MAYOR_60', 'OTRO');

-- AlterTable: el DEFAULT actual es `'GENERAL'::text` y Postgres NO lo puede
-- convertir automaticamente al enum ("default for column ... cannot be cast
-- automatically"), asi que primero se quita, se cambia el tipo con USING y se
-- vuelve a fijar (si no, los INSERT sin `bono` dejarian de funcionar).
ALTER TABLE "Alerta" ALTER COLUMN "bono" DROP DEFAULT;
ALTER TABLE "Alerta" ALTER COLUMN "bono" TYPE "BonoAlerta" USING "bono"::"BonoAlerta";
ALTER TABLE "Alerta" ALTER COLUMN "bono" SET DEFAULT 'GENERAL';
