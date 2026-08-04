-- v07 — escalones adentro de una serie (dropset y familia)
--
-- `set_logs` tiene UNIQUE (cycle_id, program_exercise_id, week, set_number):
-- una fila por serie. Un dropset son varios escalones de la MISMA serie, y
-- meterlos como series aparte rompia el conteo de series y el tonelaje por
-- serie.
--
-- Se guardan como JSON en la propia fila, con el mismo criterio que
-- `body_measurements.values_json`: el conjunto de campos lo define la app
-- (`lib/tecnicas.js`) y la base solo lo transporta. Agregar rest-pause o
-- myo-reps despues no necesita otra migracion.
--
--   [{"kg": 30, "reps": 6}, {"kg": 20, "reps": 5}]
--
-- La columna `program_exercises.technique` NO se toca: existe desde la v01,
-- el repo ya la lee y la escribe, y hasta ahora nadie la habia usado.

ALTER TABLE set_logs ADD COLUMN steps_json TEXT;
