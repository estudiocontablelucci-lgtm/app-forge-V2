/**
 * Muestra los pares de superserie de un programa. Solo LEE.
 *
 *   node scripts/ver-superseries.mjs "Ciclo 2"
 */
const filtro = process.argv[2] || "Ciclo 2";

const { getDb } = await import("../lib/db.js");
const db = getDb();

const p = await db.execute({
  sql: "SELECT id, name FROM programs WHERE name LIKE ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1",
  args: [`%${filtro}%`],
});
if (!p.rows[0]) {
  console.error(`no encontre un programa que coincida con "${filtro}"`);
  process.exit(1);
}

const ex = await db.execute({
  sql: `SELECT id, session_code, order_idx, name, superset_with, tempo, reps_min, reps_max
        FROM program_exercises WHERE program_id = ? AND deleted_at IS NULL
        ORDER BY session_code, order_idx`,
  args: [p.rows[0].id],
});
const porId = new Map(ex.rows.map((e) => [e.id, e]));

console.log(`${p.rows[0].name}\n`);
const conSS = ex.rows.filter((e) => e.superset_with);
if (!conSS.length) console.log("  sin superseries");
for (const e of conSS) {
  const otro = porId.get(e.superset_with);
  console.log(`  ${e.session_code}${e.order_idx} ${e.name}  <->  ${otro ? otro.name : e.superset_with}`);
}
console.log("\ntempos cargados:");
for (const e of ex.rows.filter((x) => x.tempo)) {
  console.log(`  ${e.session_code}${e.order_idx} ${String(e.name).padEnd(28)} ${e.tempo}`);
}
