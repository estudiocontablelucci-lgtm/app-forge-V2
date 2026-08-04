-- ============================================================
-- FORGE v2 — Migracion v06: asistencia mensual cargada a mano
--
-- Los dias de gimnasio por mes se calculan solos del historial, asi que para
-- todo lo que la app registre no hace falta guardar nada. Esta tabla existe
-- por los meses que la app NO vivio: la planilla trae dos anios de asistencia
-- previos y, sin un lugar donde ponerlos, el grafico arranca vacio y tarda dos
-- anios en volverse util — justo el periodo con el que hay que comparar.
--
-- Tambien cubre el mes de la mudanza, donde el historial tiene tres sesiones
-- porque la app se empezo a usar a mitad de mes y la persona entreno nueve.
-- Ahi el dato cargado a mano es el correcto y le gana al calculado.
--
-- No se guardan los dias concretos, solo cuantos: reconstruir a posteriori que
-- martes de marzo de 2025 se fue al gimnasio no es un dato que exista, y
-- fabricar sesiones vacias para ese mes ensuciaria el tonelaje y los e1RM.
-- ============================================================

CREATE TABLE attendance_months (
  athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month      TEXT NOT NULL,                    -- 'AAAA-MM'
  days       INTEGER NOT NULL CHECK (days >= 0 AND days <= 31),
  source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import')),
  note       TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (athlete_id, month)
);

CREATE INDEX idx_attendance_athlete ON attendance_months (athlete_id, month);
