/**
 * Asistencia mensual cargada a mano.
 *
 * Solo los meses que la app no vivio, o los que registro a medias. Lo que la
 * app si registro se calcula del historial y no se guarda dos veces: un dato
 * duplicado es un dato que un dia va a discrepar consigo mismo.
 */
import { getDb, now } from "../db.js";

export async function listar(athleteId) {
  const r = await getDb().execute({
    sql: `SELECT month, days, source, note FROM attendance_months
          WHERE athlete_id = ? AND deleted_at IS NULL
          ORDER BY month`,
    args: [athleteId],
  });
  return r.rows.map((x) => ({ mes: x.month, dias: Number(x.days), origen: x.source, nota: x.note || null }));
}

/** Mapa { 'AAAA-MM': dias } listo para combinar con lo calculado. */
export async function mapa(athleteId) {
  return Object.fromEntries((await listar(athleteId)).map((x) => [x.mes, x.dias]));
}

export async function guardar({ athleteId, mes, dias, origen = "manual", nota = null }) {
  const n = parseInt(dias, 10);
  if (!/^\d{4}-\d{2}$/.test(String(mes))) return { ok: false, motivo: "mes-invalido" };
  if (!Number.isFinite(n) || n < 0 || n > 31) return { ok: false, motivo: "dias-invalidos" };

  await getDb().execute({
    sql: `INSERT INTO attendance_months (athlete_id, month, days, source, note, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (athlete_id, month) DO UPDATE SET
            days = excluded.days, source = excluded.source, note = excluded.note,
            updated_at = excluded.updated_at, deleted_at = NULL`,
    args: [athleteId, String(mes), n, origen, nota, now()],
  });
  return { ok: true };
}

/** Baja del mes cargado a mano: vuelve a valer lo que diga el historial. */
export async function borrar({ athleteId, mes }) {
  const r = await getDb().execute({
    sql: `UPDATE attendance_months SET deleted_at = ?, updated_at = ?
          WHERE athlete_id = ? AND month = ? AND deleted_at IS NULL`,
    args: [now(), now(), athleteId, String(mes)],
  });
  return r.rowsAffected > 0;
}
