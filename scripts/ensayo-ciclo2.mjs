/**
 * Ensaya `aplicar-ciclo2-sem34.mjs` sobre una copia descartable.
 *
 *   node scripts/ensayo-ciclo2.mjs
 *
 * Un `--dry` dice QUE se va a escribir; no dice si la escritura ENTRA. Lo que
 * puede fallar aca no es la logica sino el schema: `UNIQUE (program_id,
 * session_code, order_idx)` se verifica sentencia por sentencia, asi que un
 * reordenamiento que al final del lote es consistente igual puede reventar en
 * el medio. Eso solo se descubre escribiendo.
 *
 * Copia el programa real de produccion a una base local, corre el script contra
 * ella y compara el resultado con lo que el documento pide.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/ensayo-ciclo2.db");
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }

const prod = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const copia = createClient({ url: `file:${dbPath}` });
await copia.execute("PRAGMA foreign_keys = ON");
for (const f of readdirSync(resolve(root, "db")).filter((f) => /^v\d+_.*\.sql$/.test(f)).sort()) {
  const stmts = readFileSync(resolve(root, "db", f), "utf8")
    .split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  await copia.batch(stmts, "write");
}

/** Copia las filas de una tabla tal cual, sin conocer sus columnas. */
async function clonar(tabla, where, args = []) {
  const r = await prod.execute({ sql: `SELECT * FROM ${tabla} ${where}`, args });
  if (!r.rows.length) return 0;
  const cols = r.columns;
  const marcas = cols.map(() => "?").join(", ");
  await copia.batch(
    r.rows.map((fila) => ({
      sql: `INSERT INTO ${tabla} (${cols.join(", ")}) VALUES (${marcas})`,
      args: cols.map((c) => fila[c]),
    })),
    "write",
  );
  return r.rows.length;
}

const email = "agustin.lucci@gmail.com";
const u = await prod.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
const userId = u.rows[0].id;
const p = await prod.execute({
  sql: `SELECT id FROM programs WHERE owner_user_id = ? AND name LIKE '%Ciclo 2%' AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
  args: [userId],
});
const programId = p.rows[0].id;

// Durante la copia las FK van APAGADAS: se clona un recorte del grafo (un
// usuario, un programa) y sus referencias a lo que quedo afuera —el coach, las
// asignaciones— no existen aca. Se vuelven a encender despues, que es cuando
// importan: lo que hay que verificar es si ENTRA lo que el script escribe.
await copia.execute("PRAGMA foreign_keys = OFF");
console.log("clonando de produccion (solo lectura):");
console.log(`  users              ${await clonar("users", "WHERE id = ?", [userId])}`);
console.log(`  exercises          ${await clonar("exercises", "WHERE owner_user_id IS NULL OR owner_user_id = ?", [userId])}`);
console.log(`  programs           ${await clonar("programs", "WHERE id = ?", [programId])}`);
console.log(`  program_sessions   ${await clonar("program_sessions", "WHERE program_id = ?", [programId])}`);
console.log(`  program_exercises  ${await clonar("program_exercises", "WHERE program_id = ?", [programId])}`);

await copia.execute("PRAGMA foreign_keys = ON");

console.log("\ncorriendo el script contra la copia:\n");
const salida = execFileSync(
  process.execPath,
  [resolve(root, "scripts/aplicar-ciclo2-sem34.mjs")],
  { env: { ...process.env, DATABASE_URL: `file:${dbPath}`, TURSO_AUTH_TOKEN: "" }, encoding: "utf8" },
);
console.log(salida.split("\n").slice(-4).join("\n"));

/* ---------- que quedo ---------- */

const fallas = [];
const ex = await copia.execute({
  sql: `SELECT session_code, order_idx, name, ref_kg, reps_min, reps_max, tempo, exercise_id
        FROM program_exercises WHERE program_id = ? AND deleted_at IS NULL
        ORDER BY session_code, order_idx`,
  args: [programId],
});

for (const s of ["A", "B", "C"]) {
  const filas = ex.rows.filter((e) => e.session_code === s);
  const ordenes = filas.map((e) => e.order_idx);
  const esperado = Array.from({ length: filas.length }, (_, i) => i + 1);
  if (JSON.stringify(ordenes) !== JSON.stringify(esperado)) {
    fallas.push(`sesion ${s}: ordenes ${ordenes.join(",")} en vez de 1..${filas.length}`);
  }
  console.log(`\n  ${s}: ` + filas.map((e) => `${e.order_idx} ${e.name}`).join(" · "));
}

const nueva = ex.rows.find((e) => e.name === "Prensa 45° pesada");
if (!nueva) fallas.push("no aparecio Prensa 45° pesada");
else {
  if (String(nueva.ref_kg) !== "145") fallas.push(`la prensa quedo con ref ${nueva.ref_kg}`);
  if (!nueva.exercise_id) fallas.push("la prensa quedo sin ejercicio de catalogo");
}
if (ex.rows.some((e) => e.name === "Prensa horizontal")) fallas.push("la prensa horizontal sigue en el programa");

const gemelo = ex.rows.find((e) => e.name === "Gemelo sentado");
if (gemelo?.tempo !== "2-3-1-0") fallas.push(`el ISO-EST no quedo: tempo ${gemelo?.tempo}`);

// Idempotencia: correrlo dos veces no puede cambiar nada la segunda.
const otra = execFileSync(
  process.execPath,
  [resolve(root, "scripts/aplicar-ciclo2-sem34.mjs"), "--dry"],
  { env: { ...process.env, DATABASE_URL: `file:${dbPath}`, TURSO_AUTH_TOKEN: "" }, encoding: "utf8" },
);
if (!otra.includes("nada que cambiar") && !otra.includes("ya existe")) {
  fallas.push("no es idempotente: la segunda corrida sigue viendo cambios");
}

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length}:`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  el ensayo entra sin romper restricciones y es idempotente");
