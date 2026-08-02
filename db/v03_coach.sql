-- ============================================================
-- FORGE v2 — Migracion v03: catalogo de ejercicios e invitaciones
--
-- Prepara la fase 5 (rol entrenador). Dos cosas:
--
--   1. `exercises` — el catalogo deja de vivir solo en el cliente y pasa a
--      tener dueno: NULL = base global de solo lectura, o el coach que lo creo.
--
--   2. `coach_invites` — invitar a alguien que TODAVIA NO TIENE CUENTA.
--      `coach_athletes` no puede representarlo: su `athlete_id` es NOT NULL y
--      ademas es parte de la PK, asi que no hay forma de guardar una invitacion
--      hasta que la persona se registre. El comentario de la v01 decia que
--      `invite_email` cubria ese caso, pero la estructura no lo permite.
--      El vinculo en `coach_athletes` se crea recien al aceptar.
-- ============================================================

-- ---------- Catalogo de ejercicios ----------

CREATE TABLE exercises (
  id           TEXT PRIMARY KEY,
  coach_id     TEXT REFERENCES coaches(id) ON DELETE CASCADE,  -- NULL = catalogo base
  name         TEXT NOT NULL,
  -- Nombre normalizado (sin tildes ni puntuacion) para deduplicar y buscar.
  -- Lo calcula la app: SQLite no tiene unaccent.
  name_norm    TEXT NOT NULL,
  muscle_group TEXT,
  unit         TEXT NOT NULL DEFAULT 'reps' CHECK (unit IN ('reps','pasos')),
  is_base      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

-- Un nombre no puede repetirse dentro del mismo dueno. COALESCE porque en
-- SQLite dos NULL no colisionan en un indice unico, y el catalogo base
-- justamente tiene coach_id NULL: sin esto podria duplicarse.
CREATE UNIQUE INDEX idx_exercises_owner_name
  ON exercises (COALESCE(coach_id, ''), name_norm)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_exercises_coach ON exercises (coach_id);

-- El ejercicio del programa pasa a referenciar el catalogo. Nullable a
-- proposito: los programas anteriores a esto siguen andando con su nombre
-- denormalizado, igual que en el cliente.
ALTER TABLE program_exercises ADD COLUMN exercise_id TEXT REFERENCES exercises(id);

CREATE INDEX idx_progex_exercise ON program_exercises (exercise_id);

-- ---------- Invitaciones ----------

CREATE TABLE coach_invites (
  id          TEXT PRIMARY KEY,
  coach_id    TEXT NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,              -- normalizado en minusculas por la app
  token       TEXT NOT NULL UNIQUE,       -- va en el link del mail
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','accepted','revoked')),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT REFERENCES users(id)
);

-- Un mismo entrenador no puede tener dos invitaciones vivas al mismo email.
-- Parcial: una vez aceptada o revocada, puede volver a invitarse.
CREATE UNIQUE INDEX idx_coach_invites_pendiente
  ON coach_invites (coach_id, email)
  WHERE status = 'pending';

CREATE INDEX idx_coach_invites_email ON coach_invites (email, status);
