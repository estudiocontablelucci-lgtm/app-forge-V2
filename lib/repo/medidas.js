/**
 * Medidas corporales en la base.
 *
 * `body_measurements` existe desde la v01 y nunca la escribio nadie — la misma
 * historia que `exercises` antes de la v04. Guarda todo en `values_json`, asi
 * que agregar una circunferencia no necesita migracion: el conjunto de campos
 * lo define `lib/medidas.js` y la base solo lo transporta.
 *
 * La clave es (atleta, fecha): medir dos veces el mismo dia no son dos datos,
 * es una correccion.
 */
import { getDb, now, uid } from "../db.js";

function toUi(row) {
  let valores = {};
  try { valores = JSON.parse(row.values_json) || {}; } catch { valores = {}; }
  return { id: row.id, fecha: row.measured_on, valores, nota: row.note || null, updatedAt: row.updated_at };
}

/** Tomas del atleta, de la mas reciente a la mas vieja. */
export async function listar(athleteId, { limit = 60 } = {}) {
  const r = await getDb().execute({
    sql: `SELECT id, measured_on, values_json, note, updated_at
          FROM body_measurements
          WHERE athlete_id = ? AND deleted_at IS NULL
          ORDER BY measured_on DESC
          LIMIT ?`,
    args: [athleteId, limit],
  });
  return r.rows.map(toUi);
}

/**
 * Alta o correccion de una toma.
 *
 * Los valores se guardan tal como llegan, sin campos vacios: una circunferencia
 * que no se midio tiene que quedar AUSENTE y no en cero, o el historico muestra
 * una caida a cero que nunca paso.
 */
export async function guardar({ athleteId, fecha, valores = {}, nota = null }) {
  const limpio = {};
  for (const [k, v] of Object.entries(valores)) {
    if (v === null || v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (Number.isFinite(n)) limpio[k] = n;
  }

  const ts = now();
  await getDb().execute({
    sql: `INSERT INTO body_measurements (id, athlete_id, measured_on, values_json, note, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (athlete_id, measured_on) DO UPDATE SET
            values_json = excluded.values_json, note = excluded.note,
            updated_at = excluded.updated_at, deleted_at = NULL`,
    args: [uid(), athleteId, String(fecha), JSON.stringify(limpio), nota, ts],
  });

  const r = await getDb().execute({
    sql: `SELECT id, measured_on, values_json, note, updated_at
          FROM body_measurements WHERE athlete_id = ? AND measured_on = ?`,
    args: [athleteId, String(fecha)],
  });
  return toUi(r.rows[0]);
}

/** Borrado suave, y solo de lo propio: el athlete_id va en el WHERE. */
export async function borrar({ athleteId, id }) {
  const r = await getDb().execute({
    sql: `UPDATE body_measurements SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND athlete_id = ? AND deleted_at IS NULL`,
    args: [now(), now(), id, athleteId],
  });
  return r.rowsAffected > 0;
}
