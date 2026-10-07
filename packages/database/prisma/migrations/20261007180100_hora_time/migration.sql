-- Cambio 2: Alerta.horaDesde / Alerta.horaHasta TEXT -> TIME.
--
-- Diagnostico previo (2026-10-07):
--   9 filas: 6 NULL y 3 con 'HH:MM' validas ('05:00','13:00','17:00' /
--   '08:00','20:00','23:00'). 0 valores vacios, 0 con formato raro,
--   0 pares invertidos (desde > hasta). Todo casteable a TIME.
--
-- Mismo nombre de tipo que imprime Prisma:
--   prisma migrate diff --from-schema-datasource prisma/schema.prisma
--                       --to-schema-datamodel prisma/schema.prisma --script
--   -> ALTER TABLE "Alerta" ALTER COLUMN "horaDesde" TYPE TIME ...
--
-- Nota de aplicacion: `prisma db push` propone DROP COLUMN + ADD COLUMN (no
-- hay cast registrado text -> time), lo que perderia las 3 franjas
-- existentes. Se aplica aqui el cast explicito USING, que conserva las filas
-- y deja EXACTAMENTE el mismo estado final que pide el schema.
--
-- NULLIF('') protege por si alguna fila tuviera cadena vacia (diagnostico:
-- ninguna); ''::TIME directamente fallaria.

-- AlterTable
ALTER TABLE "Alerta" ALTER COLUMN "horaDesde" TYPE TIME USING NULLIF("horaDesde", '')::TIME;
ALTER TABLE "Alerta" ALTER COLUMN "horaHasta" TYPE TIME USING NULLIF("horaHasta", '')::TIME;
