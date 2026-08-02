-- ============================================================
-- FORGE v2 — Migracion v04: el catalogo de ejercicios es del USUARIO
--
-- La v03 creo `exercises` y `program_exercises.exercise_id`, y las dejo sin
-- usar: la app nunca escribio ahi. El catalogo siguio viviendo solo en el
-- cliente, con un id generado en cada dispositivo, y por lo tanto:
--
--   - un programa creado del lado del servidor llegaba sin referencia y sus
--     ejercicios no entraban al selector hasta recargar la app;
--   - dos dispositivos inventaban ids distintos para el mismo ejercicio.
--
-- Eso importa porque de ese id depende distinguir "corregi el nombre" de
-- "cambie de ejercicio", y esa distincion decide si el e1RM se encadena o se
-- corta. Encadenar las series de dos maquinas distintas es exactamente lo que
-- el programa real advierte que no hay que hacer.
--
-- Lo que faltaba no era la columna sino el DUENO. La v03 modelo el catalogo
-- como propiedad de un coach (`coach_id`, NULL = base global). Pero un atleta
-- que entrena solo no tiene fila en `coaches`, asi que sus ejercicios propios
-- solo podian guardarse con coach_id NULL — es decir, publicados en el catalogo
-- base de todo el mundo.
--
-- Se agrega `owner_user_id`, que es como ya funciona `programs`. `coach_id`
-- queda: esta en produccion y borrar una columna con indice es mas riesgoso que
-- dejarla. No la usa nadie; el dueno es `owner_user_id`.
-- ============================================================

ALTER TABLE exercises ADD COLUMN owner_user_id TEXT REFERENCES users(id);

-- El unico por dueno pasa a ser por usuario. COALESCE porque en SQLite dos NULL
-- no colisionan y el catalogo base justamente tiene dueno NULL: sin esto se
-- podria duplicar "Press Plano" en la base compartida.
DROP INDEX idx_exercises_owner_name;
CREATE UNIQUE INDEX idx_exercises_owner_name
  ON exercises (COALESCE(owner_user_id, ''), name_norm)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_exercises_owner ON exercises (owner_user_id);
