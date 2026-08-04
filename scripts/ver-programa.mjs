/**
 * Muestra los programas de un usuario y la tecnica de cada ejercicio.
 *
 *   node scripts/ver-programa.mjs agustin.lucci@gmail.com
 *
 * Solo LEE. Sirve para contrastar lo que la app tiene contra la planilla, que
 * es la fuente — sin esto la comparacion se hace de memoria.
 */
import { canonicalizarEmail } from "../lib/email-id.js";

const email = process.argv[2] || "agustin.lucci@gmail.com";

const { getDb } = await import("../lib/db.js");
const db = getDb();

const u = await db.execute({
  sql: "SELECT id, email, display_name FROM users WHERE email_canon = ? OR email = ?",
  args: [canonicalizarEmail(email), email],
});
if (!u.rows[0]) {
  console.error(`no hay usuario para ${email}`);
  process.exit(1);
}
const user = u.rows[0];
console.log(`usuario: ${user.display_name} <${user.email}>  id=${user.id}\n`);

const ps = await db.execute({
  sql: `SELECT id, name, weeks, status, updated_at FROM programs
        WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
  args: [user.id],
});

for (const p of ps.rows) {
  const ex = await db.execute({
    sql: `SELECT session_code, order_idx, name, muscle_group, sets, ref_kg,
                 reps_min, reps_max, superset_with, technique
          FROM program_exercises
          WHERE program_id = ? AND deleted_at IS NULL
          ORDER BY session_code, order_idx`,
    args: [p.id],
  });
  console.log(`== ${p.name}  (${p.weeks} sem · ${p.status} · ${ex.rows.length} ejercicios)`);
  console.log(`   id=${p.id}  actualizado ${p.updated_at}`);
  for (const e of ex.rows) {
    const marca = e.technique ? `  <<< ${e.technique}` : "";
    console.log(`   ${e.session_code}${e.order_idx}  ${String(e.name).padEnd(30)} ${String(e.muscle_group || "").padEnd(12)} ${e.sets}x${e.reps_min}-${e.reps_max}  ref ${e.ref_kg ?? "—"}${marca}`);
  }
  console.log();
}
