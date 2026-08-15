-- v08 — Cuando el entrenador vio por ultima vez las notas de un alumno.
--
-- El alumno escribe una nota al cerrar la sesion ("me molesto el hombro", "la
-- prensa quedo corta") y esa nota ya viajaba y ya se mostraba en la ficha. Lo
-- que faltaba era que ALGUIEN AVISARA: sin esto, el entrenador se entera cuando
-- entra a la ficha por otro motivo, que puede ser nunca.
--
-- Va en el vinculo y no en el usuario ni en el localStorage del coach: "leido"
-- es una propiedad del PAR entrenador-alumno —dos entrenadores del mismo alumno
-- lo leen cada uno por su lado— y tiene que sobrevivir al cambio de dispositivo,
-- que es justo lo que un flag local no hace.
--
-- NULL = nunca miro. Todas sus notas cuentan como nuevas, que es lo correcto
-- para un vinculo recien creado.

ALTER TABLE coach_athletes ADD COLUMN notes_seen_at TEXT;
