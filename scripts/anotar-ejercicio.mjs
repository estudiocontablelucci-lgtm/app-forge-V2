/**
 * Agrega una nota de ejecucion a un ejercicio del programa. Solo la nota.
 *
 *   node scripts/anotar-ejercicio.mjs --programa "Ciclo 2" --sesion B \
 *     --ejercicio "Vuelos posteriores" --nota "Codos fijos..." [--dry]
 *
 * La nota se APILA debajo de lo que ya haya: `description` suele traer el
 * historial de por que subio la carga, y pisarlo perderia el motivo.
 *
 * Idempotente: si la nota ya esta, no escribe.
 */
import { canonicalizarEmail } from "../lib/email-id.js";

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes("--dry");

const email = arg("email") || "agustin.lucci@gmail.com";
const filtroPrograma = arg("programa");
const sesion = arg("sesion");
const ejercicio = arg("ejercicio");
const nota = arg("nota");
if (!filtroPrograma || !ejercicio || !nota) {
  console.error("faltan --programa, --ejercicio o --nota");
  process.exit(1);
}

const { getDb, now } = await import("../lib/db.js");
const db = getDb();

const u = await db.execute({
  sql: "SELECT id FROM users WHERE email_canon = ? OR email = ?",
  args: [canonicalizarEmail(email), email],
});
if (!u.rows[0]) { console.error(`no hay usuario para ${email}`); process.exit(1); }

const p = await db.execute({
  sql: `SELECT id, name FROM programs
        WHERE owner_user_id = ? AND name LIKE ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
  args: [u.rows[0].id, `%${filtroPrograma}%`],
});
if (!p.rows[0]) { console.error(`no encontre "${filtroPrograma}"`); process.exit(1); }

const filtroSesion = sesion ? "AND session_code = ?" : "";
const e = await db.execute({
  sql: `SELECT id, name, session_code, description FROM program_exercises
        WHERE program_id = ? AND name = ? ${filtroSesion} AND deleted_at IS NULL`,
  args: sesion ? [p.rows[0].id, ejercicio, sesion] : [p.rows[0].id, ejercicio],
});
if (!e.rows.length) { console.error(`no encontre "${ejercicio}"`); process.exit(1); }

const ts = now();
const stmts = [];
for (const fila of e.rows) {
  if ((fila.description || "").includes(nota)) {
    console.log(`  =  ${fila.session_code} · ${fila.name} (ya la tenia)`);
    continue;
  }
  const texto = fila.description ? `${fila.description}\n${nota}` : nota;
  console.log(`  +  ${fila.session_code} · ${fila.name}`);
  console.log(`     ${texto.split("\n").join("\n     ")}`);
  stmts.push({
    sql: "UPDATE program_exercises SET description = ?, updated_at = ? WHERE id = ?",
    args: [texto, ts, fila.id],
  });
}

if (!stmts.length) { console.log("\nnada que cambiar"); process.exit(0); }
if (dry) { console.log("\n--dry: no se escribio nada"); process.exit(0); }

// El programa queda editado AHORA: si no, el telefono con una copia mas nueva
// gana el merge y deshace la nota al sincronizar.
stmts.push({ sql: "UPDATE programs SET updated_at = ? WHERE id = ?", args: [ts, p.rows[0].id] });
await db.batch(stmts, "write");
console.log(`\nescrito en ${stmts.length - 1} ejercicio(s)`);
