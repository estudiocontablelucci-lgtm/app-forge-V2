-- ============================================================
-- FORGE v2 — Migracion v01: identidad, programas, asignaciones, logs
--
-- Modelo multi-tenant COMPLETO desde el arranque, aunque la UI de la Fase 4
-- solo exponga el caso de atleta individual. El rol de entrenador despues es
-- UI y permisos sobre estas mismas tablas, no una migracion.
--
-- Atleta individual = usuario SIN fila en coach_athletes. No se bifurca el modelo.
--
-- Convenciones:
--   - ids TEXT (uid base36, igual que el cliente) — no autoincrement, para que
--     el cliente pueda generar ids offline sin colisionar ni esperar al server.
--   - timestamps TEXT ISO-8601 UTC. SQLite no tiene tipo fecha; ISO ordena bien
--     lexicograficamente, que es lo que necesita el pull incremental.
--   - toda tabla sincronizable lleva updated_at + deleted_at (soft delete):
--     el pull es "dame todo lo que cambio desde T" y un DELETE duro no viaja.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Identidad ----------

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  password_hash  TEXT,                     -- NULL si entra por OAuth
  role           TEXT NOT NULL DEFAULT 'athlete' CHECK (role IN ('athlete','coach','both')),
  body_weight_kg REAL,                     -- para e1RM en ejercicios BW
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);

-- El entrenador es entidad de primera clase, NO un coach_id colgado de users:
-- es la unidad que paga y a la que se le cuelga plan, limite de alumnos y features.
CREATE TABLE coaches (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  features      TEXT NOT NULL DEFAULT '{}',   -- JSON, mismo patron que Tesoreria
  max_athletes  INTEGER NOT NULL DEFAULT 3,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_coaches_owner ON coaches (owner_user_id);

-- Relacion con historia: un alumno puede cambiar de entrenador y el vinculo
-- viejo queda como 'ended' en vez de borrarse (los datos historicos sobreviven).
CREATE TABLE coach_athletes (
  coach_id    TEXT NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  athlete_id  TEXT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','ended')),
  invite_email TEXT,                       -- invitacion a alguien que aun no tiene cuenta
  invited_at  TEXT NOT NULL,
  accepted_at TEXT,
  ended_at    TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (coach_id, athlete_id)
);
CREATE INDEX idx_coach_athletes_athlete ON coach_athletes (athlete_id, status);

-- ---------- Programa (plantilla reutilizable) ----------

CREATE TABLE programs (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  coach_id      TEXT REFERENCES coaches(id) ON DELETE SET NULL,  -- NULL = programa personal
  name          TEXT NOT NULL,
  weeks         INTEGER NOT NULL DEFAULT 4,
  has_deload    INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  version       INTEGER NOT NULL DEFAULT 1,   -- concurrencia optimista al editar la plantilla
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_programs_owner ON programs (owner_user_id);
CREATE INDEX idx_programs_coach ON programs (coach_id);

CREATE TABLE program_sessions (
  id         TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,                -- 'A','B','C'
  name       TEXT NOT NULL,
  order_idx  INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (program_id, code)
);

CREATE TABLE program_exercises (
  id            TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  session_code  TEXT NOT NULL,
  order_idx     INTEGER NOT NULL,
  name          TEXT NOT NULL,
  muscle_group  TEXT,
  sets          INTEGER NOT NULL DEFAULT 3,
  ref_kg        TEXT,                      -- SUGERIDA por la plantilla. La real vive en assignment_refs.
  reps_min      INTEGER,
  reps_max      INTEGER,
  rep_unit      TEXT NOT NULL DEFAULT 'reps' CHECK (rep_unit IN ('reps','pasos')),
  tempo         TEXT,
  rest_sec      INTEGER,
  rir_target    TEXT,
  superset_with TEXT REFERENCES program_exercises(id) ON DELETE SET NULL,
  technique     TEXT,                      -- 'DS' | 'ASIM-IZQ' | NULL — campo que hoy no existe en la app
  description   TEXT,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  UNIQUE (program_id, session_code, order_idx)
);
CREATE INDEX idx_progex_program ON program_exercises (program_id, session_code, order_idx);

-- ---------- Asignacion (programa x atleta) ----------

CREATE TABLE assignments (
  id          TEXT PRIMARY KEY,
  program_id  TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  athlete_id  TEXT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  starts_on   TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_assignments_athlete ON assignments (athlete_id, status);
CREATE INDEX idx_assignments_program ON assignments (program_id);

-- LA tabla que faltaba en forge-arquitectura.md.
-- Sin esto, un programa asignado a 10 alumnos les impone los mismos kilos —
-- y la referencia es justamente lo mas personal que hay (sale de la
-- autorregulacion de ESE atleta). Con esto el entrenador escribe la plantilla
-- una vez, calibra por alumno, y puede corregir el programa sin pisarle los
-- kilos a nadie.
--
-- week permite ademas refs por semana (periodizacion real: rutina_gym.md sube
-- las refs en Sem 4), sin ensuciar la plantilla. '*' = aplica a todas.
CREATE TABLE assignment_refs (
  assignment_id       TEXT NOT NULL REFERENCES assignments(id)        ON DELETE CASCADE,
  program_exercise_id TEXT NOT NULL REFERENCES program_exercises(id)  ON DELETE CASCADE,
  week                TEXT NOT NULL DEFAULT '*',   -- '*' | '1'..'n' | 'DL'
  ref_kg              TEXT,
  sets                INTEGER,                     -- override opcional (alumno lesionado, etc.)
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (assignment_id, program_exercise_id, week)
);

-- ---------- Ejecucion ----------

-- Un ciclo es UNA instancia del programa ejecutada por un atleta en fechas
-- concretas. Permite archivar C1 y arrancar C2 con la misma plantilla ajustada.
CREATE TABLE cycles (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  athlete_id    TEXT NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  label         TEXT NOT NULL,             -- 'C1','C2'
  started_at    TEXT,
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_cycles_athlete ON cycles (athlete_id, archived_at);

-- Cabecera de sesion: es el "historial" actual de la app (health check, duracion).
CREATE TABLE session_logs (
  id            TEXT PRIMARY KEY,
  cycle_id      TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  athlete_id    TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  week          TEXT NOT NULL,
  session_code  TEXT NOT NULL,
  session_name  TEXT,
  performed_at  TEXT NOT NULL,
  duration_min  INTEGER,
  health_sleep  INTEGER,
  health_stress INTEGER,
  health_energy INTEGER,
  note          TEXT,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  -- Una sesion por semana x sesion x ciclo: repetir la misma reemplaza,
  -- que es el comportamiento del re-entry flow actual.
  UNIQUE (cycle_id, week, session_code)
);
CREATE INDEX idx_sesslogs_athlete_time ON session_logs (athlete_id, performed_at);

CREATE TABLE set_logs (
  id                  TEXT PRIMARY KEY,
  cycle_id            TEXT NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  athlete_id          TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  program_exercise_id TEXT REFERENCES program_exercises(id) ON DELETE SET NULL,
  exercise_name       TEXT NOT NULL,       -- desnormalizado a proposito: el log
                                           -- sobrevive si el coach borra el ejercicio
  week                TEXT NOT NULL,
  session_code        TEXT NOT NULL,
  set_number          INTEGER NOT NULL,
  kg                  REAL,                -- NULL en BW
  reps                INTEGER,
  rir                 REAL,
  e1rm                REAL,                -- persistido, no solo calculado en vista
  logged_at           TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT,
  UNIQUE (cycle_id, program_exercise_id, week, set_number)
);
CREATE INDEX idx_setlogs_cycle    ON set_logs (cycle_id, week, session_code);
CREATE INDEX idx_setlogs_exercise ON set_logs (athlete_id, exercise_name, logged_at);

-- ---------- Medidas corporales ----------

CREATE TABLE body_measurements (
  id         TEXT PRIMARY KEY,
  athlete_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measured_on TEXT NOT NULL,
  values_json TEXT NOT NULL,               -- JSON: { pecho: 104, brazo_d: 37.3, ... }
  note       TEXT,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (athlete_id, measured_on)
);

-- ---------- Consentimiento de datos sensibles (Ley 25.326) ----------

-- Los campos de texto libre (description, note) contienen lesiones y condiciones
-- medicas. Con datos propios eso es un feature; con alumnos de terceros convierte
-- al operador en responsable de una base con datos sensibles, que requieren
-- consentimiento expreso e informado. Se registra aca para que sea auditable.
CREATE TABLE health_consents (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_to  TEXT REFERENCES coaches(id) ON DELETE CASCADE,  -- NULL = solo la plataforma
  scope       TEXT NOT NULL,               -- 'health_notes' | 'measurements' | ...
  granted_at  TEXT NOT NULL,
  revoked_at  TEXT,
  policy_version TEXT NOT NULL
);
CREATE INDEX idx_consents_user ON health_consents (user_id, scope);

-- schema_migrations la crea y la mantiene scripts/migrate.mjs — el bookkeeping
-- de migraciones es del runner, no del schema.
