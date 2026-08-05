/**
 * Sustituye un ejercicio de un programa por otro. Cambio de MAQUINA, no de
 * nombre.
 *
 *   node scripts/sustituir-ejercicio.mjs \
 *     --programa "Ciclo 2" --sesion A \
 *     --viejo "Sentadilla pendular" --nuevo "Sentadilla pendular (con respaldo)" \
 *     [--grupo Cuádriceps] [--ref 70] [--reps 10-12] [--series 3] [--dry]
 *
 * Hace lo mismo que hace la app cuando cambias el ejercicio de una fila que ya
 * tiene series: el nuevo entra con id propio y el viejo SALE del programa. Su
 * historial y su e1RM quedan con el, sin encadenarse — la regla que el propio
 * programa escribio para la pendular contra el belt squat ("su e1RM arranca
 * como serie nueva, no continua la del belt squat").
 *
 * Sin --ref el ejercicio queda sin referencia, que la app muestra como
 * "maquina": la carga de la maquina nueva no se hereda de la vieja, se calibra
 * en la primera sesion.
 *
 * DELETE duro sobre la fila vieja, igual que `saveProgram`: con soft delete
 * seguiria ocupando su `order_idx` y chocaria contra la nueva por el UNIQUE. El
 * historial sobrevive porque `set_logs` guarda `exercise_name` y su FK es
 * ON DELETE SET NULL.
 */
import { canonicalizarEmail } from "../lib/email-id.js";

const args = process.argv.slice(2);
const arg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const dry = args.includes("--dry");

const email = arg("email") || "agustin.lucci@gmail.com";
const filtroPrograma = arg("programa");
const sesion = arg("sesion");
const viejoNombre = arg("viejo");
const nuevoNombre = arg("nuevo");
if (!filtroPrograma || !sesion || !viejoNombre || !nuevoNombre) {
  console.error("faltan --programa, --sesion, --viejo o --nuevo");
  process.exit(1);
}

const { getDb, now, uid } = await import("../lib/db.js");
const { normalizar } = await import("../lib/catalog.js");
const db = getDb();

const u = await db.execute({
  sql: "SELECT id FROM users WHERE email_canon = ? OR email = ?",
  args: [canonicalizarEmail(email), email],
});
if (!u.rows[0]) { console.error(`no hay usuario para ${email}`); process.exit(1); }
const userId = u.rows[0].id;

const p = await db.execute({
  sql: `SELECT id, name FROM programs
        WHERE owner_user_id = ? AND name LIKE ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
  args: [userId, `%${filtroPrograma}%`],
});
if (!p.rows[0]) { console.error(`no encontre un programa que coincida con "${filtroPrograma}"`); process.exit(1); }
const programa = p.rows[0];

const yaEsta = await db.execute({
  sql: `SELECT id FROM program_exercises
        WHERE program_id = ? AND session_code = ? AND name = ? AND deleted_at IS NULL`,
  args: [programa.id, sesion, nuevoNombre],
});
if (yaEsta.rows.length) {
  console.log(`"${nuevoNombre}" ya esta en la sesion ${sesion}. Nada que hacer.`);
  process.exit(0);
}

const v = await db.execute({
  sql: `SELECT * FROM program_exercises
        WHERE program_id = ? AND session_code = ? AND name = ? AND deleted_at IS NULL`,
  args: [programa.id, sesion, viejoNombre],
});
if (!v.rows.length) { console.error(`no encontre "${viejoNombre}" en la sesion ${sesion}`); process.exit(1); }
if (v.rows.length > 1) { console.error(`hay ${v.rows.length} filas con ese nombre: no se cual`); process.exit(1); }
const viejo = v.rows[0];

const series = await db.execute({
  sql: `SELECT COUNT(*) AS n, MIN(week) AS desde, MAX(week) AS hasta, MAX(e1rm) AS e1rm
        FROM set_logs WHERE program_exercise_id = ? AND deleted_at IS NULL`,
  args: [viejo.id],
});
const s = series.rows[0];

const reps = arg("reps");
const repsMin = reps ? Number(reps.split("-")[0]) : viejo.reps_min;
const repsMax = reps ? Number(reps.split("-")[1] ?? reps.split("-")[0]) : viejo.reps_max;
const ref = arg("ref");
const sets = arg("series") ? Number(arg("series")) : viejo.sets;
const grupo = arg("grupo") || viejo.muscle_group;

console.log(`programa: ${programa.name}`);
console.log(`sesion ${sesion}, puesto ${viejo.order_idx}\n`);
console.log(`  SALE   ${viejo.name}`);
console.log(`         ${Number(s.n)} series registradas (sem ${s.desde ?? "—"} a ${s.hasta ?? "—"})` +
            `${s.e1rm ? `, e1RM max ${Math.round(s.e1rm)}` : ""}`);
console.log(`         se conservan con el: no se encadenan con el nuevo\n`);
console.log(`  ENTRA  ${nuevoNombre}`);
console.log(`         ${sets}x${repsMin}-${repsMax} · ref ${ref ?? "— (la muestra como \"máquina\")"} · grupo ${grupo}`);
if (viejo.superset_with) console.log(`         mantiene la superserie`);
if (viejo.technique) console.log(`         mantiene la tecnica ${viejo.technique}`);

if (dry) { console.log("\n--dry: no se escribio nada"); process.exit(0); }

const ts = now();
const nuevoId = `${userId}~${uid()}`;
const catalogoId = `${userId}~ex-${normalizar(nuevoNombre).replace(/\s+/g, "-").slice(0, 40)}`;

const stmts = [
  {
    // El ejercicio tiene que existir en el catalogo: una fila del programa con
    // `exercise_id` NULL pierde la identidad del ejercicio entre dispositivos.
    // Va como ejercicio del USUARIO — los `base-*` son universales.
    sql: `INSERT INTO exercises
            (id, coach_id, owner_user_id, name, name_norm, muscle_group, unit, is_base, created_at, updated_at)
          VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, ?)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name, name_norm = excluded.name_norm,
            updated_at = excluded.updated_at, deleted_at = NULL`,
    args: [catalogoId, userId, nuevoNombre, normalizar(nuevoNombre), grupo, viejo.rep_unit || "reps", ts, ts],
  },
  { sql: "DELETE FROM program_exercises WHERE id = ?", args: [viejo.id] },
  {
    sql: `INSERT INTO program_exercises
            (id, program_id, session_code, order_idx, name, muscle_group, sets, ref_kg,
             reps_min, reps_max, rep_unit, tempo, rest_sec, rir_target, superset_with,
             technique, description, exercise_id, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    args: [
      nuevoId, programa.id, sesion, viejo.order_idx, nuevoNombre, grupo, sets,
      ref ?? null, repsMin, repsMax, viejo.rep_unit || "reps", viejo.tempo,
      viejo.rest_sec, viejo.rir_target, viejo.technique,
      `Sustituye a ${viejo.name}. Su e1RM arranca como serie nueva: es otra máquina, no más fuerza.` +
      (viejo.description ? `\n${viejo.description}` : ""),
      catalogoId, ts,
    ],
  },
];

// La superserie apuntaba a la fila vieja: hay que rehacer el vinculo o el
// companero queda solo. `superset_with` es ON DELETE SET NULL, asi que sin esto
// el par se rompe en silencio.
if (viejo.superset_with) {
  stmts.push({
    sql: "UPDATE program_exercises SET superset_with = ?, updated_at = ? WHERE id = ?",
    args: [nuevoId, ts, viejo.superset_with],
  });
  stmts.push({
    sql: "UPDATE program_exercises SET superset_with = ?, updated_at = ? WHERE id = ?",
    args: [viejo.superset_with, ts, nuevoId],
  });
}

// El programa queda editado AHORA: si no, el telefono con una copia mas nueva
// gana el merge y deshace la sustitucion al sincronizar.
stmts.push({ sql: "UPDATE programs SET updated_at = ? WHERE id = ?", args: [ts, programa.id] });

await db.batch(stmts, "write");
console.log(`\nhecho. id nuevo: ${nuevoId}`);
