/**
 * Comprueba contra la base APUNTADA POR DATABASE_URL que la consulta de la
 * lista de alumnos corre — sin imprimir datos de nadie: solo conteos.
 *
 *   node scripts/verificar-notas-vistas.mjs
 *
 * Existe porque la v08 agrega una columna que la consulta USA: si la migracion
 * no se aplico, la seccion de entrenador devuelve 500 y eso solo se ve estando
 * logueado. Esto lo detecta sin sesion.
 */
import { getDb } from "../lib/db.js";
import { listarAlumnos } from "../lib/repo/coaching.js";

const db = getDb();

const cols = await db.execute("PRAGMA table_info(coach_athletes)");
const tiene = cols.rows.some((c) => c.name === "notes_seen_at");
console.log(`columna notes_seen_at: ${tiene ? "SI" : "NO — falta correr npm run migrate"}`);
if (!tiene) process.exit(1);

const coaches = await db.execute("SELECT id FROM coaches WHERE deleted_at IS NULL");
console.log(`espacios de entrenador: ${coaches.rows.length}`);

for (const c of coaches.rows) {
  const alumnos = await listarAlumnos(c.id);
  const conNotas = alumnos.filter((a) => a.notasNuevas > 0).length;
  const entrenaron = alumnos.filter((a) => a.ultima).length;
  console.log(`  espacio: ${alumnos.length} alumno(s) · ${entrenaron} con entrenamientos · ${conNotas} con notas sin leer`);
}
console.log("\nOK  la consulta de la lista corre contra esta base");
