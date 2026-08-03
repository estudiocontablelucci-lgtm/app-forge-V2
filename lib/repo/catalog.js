/**
 * Catalogo de ejercicios en la base.
 *
 * Hasta la v04 esta tabla existia y no la escribia nadie: el catalogo vivia solo
 * en el cliente, con un id inventado en cada dispositivo. El efecto no era un
 * error sino una identidad rota — el mismo "Prensa horizontal" era un ejercicio
 * distinto en el celular y en la compu, y de esa identidad depende que la app
 * sepa si cambiar un ejercicio es corregir un nombre o sustituir la maquina.
 *
 * Dos duenos posibles:
 *   - `owner_user_id` NULL + `is_base` 1 → catalogo base, compartido por todos.
 *     Sus ids son universales (`base-<slug>`) y no se prefijan.
 *   - `owner_user_id` = usuario → lo que cargo esa persona.
 */
import { getDb, now, tx } from "../db.js";

/** Sin tildes ni puntuacion, para deduplicar. Mismo criterio que el cliente. */
export function normalizar(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function toUi(row) {
  return {
    id: row.id,
    name: row.name,
    group: row.muscle_group,
    unit: row.unit,
    base: row.is_base === 1,
  };
}

/** El catalogo que le corresponde a un usuario: el base mas lo suyo. */
export async function listCatalog(userId) {
  const r = await getDb().execute({
    sql: `SELECT id, name, muscle_group, unit, is_base
          FROM exercises
          WHERE deleted_at IS NULL AND (is_base = 1 OR owner_user_id = ?)
          ORDER BY is_base DESC, name`,
    args: [userId],
  });
  return r.rows.map(toUi);
}

/**
 * Guarda el catalogo del usuario.
 *
 * Las entradas base se insertan una sola vez y despues se ignoran: son de todos
 * y ningun usuario puede reescribirlas desde su dispositivo. Las propias se
 * actualizan, que es lo que permite corregir el nombre de un ejercicio en un
 * lugar y que se propague a todos los programas que lo usan.
 *
 * Los ids llegan ya prefijados por quien llama (`scopeCatalog`), salvo los base.
 */
export async function saveCatalog(userId, entradas = []) {
  if (!entradas.length) return 0;
  const ts = now();
  const stmts = [];

  for (const c of entradas) {
    if (!c?.id || !c?.name) continue;
    const esBase = Boolean(c.base);

    if (esBase) {
      // DO NOTHING y no DO UPDATE: el catalogo base es de solo lectura, y dos
      // usuarios subiendolo a la vez no tienen por que pisarse.
      stmts.push({
        sql: `INSERT INTO exercises (id, coach_id, owner_user_id, name, name_norm, muscle_group, unit, is_base, created_at, updated_at)
              VALUES (?, NULL, NULL, ?, ?, ?, ?, 1, ?, ?)
              ON CONFLICT (id) DO NOTHING`,
        args: [c.id, c.name, normalizar(c.name), c.group ?? null, c.unit || "reps", ts, ts],
      });
    } else {
      stmts.push({
        sql: `INSERT INTO exercises (id, coach_id, owner_user_id, name, name_norm, muscle_group, unit, is_base, created_at, updated_at)
              VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                name = excluded.name, name_norm = excluded.name_norm,
                muscle_group = excluded.muscle_group, unit = excluded.unit,
                updated_at = excluded.updated_at, deleted_at = NULL
              WHERE exercises.owner_user_id = excluded.owner_user_id`,
        args: [c.id, userId, c.name, normalizar(c.name), c.group ?? null, c.unit || "reps", ts, ts],
      });
    }
  }

  if (!stmts.length) return 0;
  await tx(stmts);
  return stmts.length;
}
