-- ============================================================
-- FORGE v2 — Migracion v05: la identidad es la CASILLA, no la grafia
--
-- `users.email` es la clave natural y se comparaba como texto exacto. En Gmail
-- los puntos del nombre de usuario no significan nada: `a.bc@gmail.com` y
-- `abc@gmail.com` son la misma casilla y reciben el mismo mail. Entrar una vez
-- con Google (que devuelve la direccion con puntos) y otra por magic link
-- escribiendola sin puntos creaba DOS cuentas, con el historial partido y el
-- vinculo con el entrenador colgando de una sola.
--
-- Ya se arreglo para las invitaciones (lib/email-id.js); esto lo lleva a la
-- identidad de la cuenta, que es donde el efecto es peor y menos reversible.
--
-- `email_canon` guarda la forma canonica. `email` sigue siendo la que la persona
-- escribio, que es la que reconoce cuando la ve y a la que se le manda el mail.
--
-- El unico es PARCIAL. Las filas que todavia no se rellenaron quedan en NULL y
-- en SQLite dos NULL no colisionan, asi que la migracion entra sin depender del
-- backfill; el backfill (scripts/backfill-email-canon.mjs) usa la funcion real
-- de JS, porque la canonicalizacion depende del dominio y SQL no sabe eso.
-- Si al rellenar aparecieran dos filas con la misma casilla, el indice lo
-- impide: preferimos que falle a fusionar dos cuentas en silencio.
-- ============================================================

ALTER TABLE users ADD COLUMN email_canon TEXT;

CREATE UNIQUE INDEX idx_users_email_canon
  ON users (email_canon)
  WHERE email_canon IS NOT NULL AND deleted_at IS NULL;
