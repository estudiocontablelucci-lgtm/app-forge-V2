/**
 * Series registradas de un ejercicio del programa. Solo LEE.
 *
 *   node scripts/ver-series-ejercicio.mjs "Prensa horizontal"
 *
 * Decide si cambiarlo es un renombre o una SUSTITUCION: con series hechas, el
 * e1RM del nuevo no puede encadenarse con el del viejo.
 */
const nombre = process.argv[2] || "Prensa horizontal";

const { getDb } = await import("../lib/db.js");
const db = getDb();

const r = await db.execute({
  sql: `SELECT pe.id, pe.name, pe.session_code, pe.order_idx, p.name AS programa,
               COUNT(s.id) AS series, MIN(s.week) AS desde, MAX(s.week) AS hasta,
               MAX(s.kg) AS kg_max, MAX(s.e1rm) AS e1rm_max
        FROM program_exercises pe
        JOIN programs p ON p.id = pe.program_id
        LEFT JOIN set_logs s ON s.program_exercise_id = pe.id AND s.deleted_at IS NULL
        WHERE pe.name = ? AND pe.deleted_at IS NULL AND p.deleted_at IS NULL
        GROUP BY pe.id
        ORDER BY series DESC`,
  args: [nombre],
});

if (!r.rows.length) {
  console.log(`no hay ningun ejercicio llamado "${nombre}"`);
  process.exit(0);
}
for (const e of r.rows) {
  console.log(`${e.programa} · ${e.session_code}${e.order_idx} · ${e.name}`);
  console.log(`  id=${e.id}`);
  if (Number(e.series) === 0) {
    console.log("  SIN SERIES registradas -> cambiarlo es editar en el lugar\n");
  } else {
    console.log(`  ${e.series} series (sem ${e.desde} a ${e.hasta}) · kg max ${e.kg_max} · e1RM max ${e.e1rm_max}`);
    console.log("  CON SERIES -> cambiar el ejercicio es una SUSTITUCION\n");
  }
}
