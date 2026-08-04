/**
 * Reproduce el push de "Terminar" con datos REALES traidos de produccion.
 *
 *   node scripts/repro-push-sesion.mjs <email>
 *
 * Existe porque una sesion se cerro con señal y no llego al servidor, y el
 * codigo del push no tiene forma de contar que le paso: el error se muestra en
 * una pantalla que el usuario no esta mirando cuando termina de entrenar.
 *
 * Lee de produccion (SOLO LECTURA) y ESCRIBE en una base descartable local, asi
 * que se puede correr sin miedo. Si el push falla, la excepcion sale entera.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const email = process.argv[2];
if (!email) { console.error("uso: node scripts/repro-push-sesion.mjs <email>"); process.exit(1); }

const origen = process.env.DATABASE_URL;
if (!origen?.startsWith("libsql://")) {
  console.error("Se necesita DATABASE_URL apuntando a produccion (solo se LEE de ahi).");
  process.exit(1);
}

/* ---------- 1. leer de produccion ---------- */
const prod = createClient({ url: origen, authToken: process.env.TURSO_AUTH_TOKEN });

const u = (await prod.execute({ sql: "SELECT id, email FROM users WHERE email = ?", args: [email] })).rows[0];
if (!u) { console.error(`no existe ${email}`); process.exit(1); }

const programas = (await prod.execute({
  sql: "SELECT id, name FROM programs WHERE owner_user_id = ? AND deleted_at IS NULL",
  args: [u.id],
})).rows;

const catalogo = (await prod.execute({
  sql: `SELECT id, name, muscle_group, unit, is_base FROM exercises
        WHERE deleted_at IS NULL AND (is_base = 1 OR owner_user_id = ?)`,
  args: [u.id],
})).rows;

console.log(`usuario ${u.id} · ${programas.length} programas · ${catalogo.length} entradas de catalogo`);

/* ---------- 2. base descartable con el mismo schema ---------- */
const dbPath = resolve(root, "db/repro-push.db");
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }
process.env.DATABASE_URL = `file:${dbPath}`;
delete process.env.TURSO_AUTH_TOKEN;

const local = createClient({ url: process.env.DATABASE_URL });
// Con las FK PRENDIDAS: si el problema es una referencia rota, se quiere ver.
await local.execute("PRAGMA foreign_keys = ON");
for (const f of readdirSync(resolve(root, "db")).filter((f) => /^v\d+_.*\.sql$/.test(f)).sort()) {
  const stmts = readFileSync(resolve(root, "db", f), "utf8")
    .split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  await local.batch(stmts, "write");
}

const users = await import("../lib/repo/users.js");
const { pushCatalogForUser, pushForUser } = await import("../lib/sync/service.js");
const { unscope } = await import("../lib/sync/ids.js");
const { getProgram } = await import("../lib/repo/programs.js");

const usuario = await users.findOrCreate({ email, displayName: "Repro" });

/* ---------- 3. el catalogo como lo manda el cliente ---------- */
// El cliente maneja ids SIN prefijo; el servidor los prefija al guardar.
const catCliente = catalogo.map((c) => ({
  id: unscope(u.id, c.id),
  name: c.name,
  group: c.muscle_group,
  unit: c.unit,
  base: c.is_base === 1,
}));

console.log("\n--- push del catalogo ---");
try {
  const r = await pushCatalogForUser(usuario.id, catCliente);
  console.log(`ok: ${r.guardados} sentencias`);
} catch (e) {
  console.error("FALLO EL CATALOGO — esto tumba el POST entero y la sesion no se guarda:");
  console.error(e.stack);
  process.exit(1);
}

/* ---------- 4. el programa + una sesion, como en "Terminar" ---------- */
// Se arma el programa desde produccion con la forma que usa el cliente.
const traer = async (programId) => {
  const p = (await prod.execute({ sql: "SELECT * FROM programs WHERE id = ?", args: [programId] })).rows[0];
  const ses = (await prod.execute({ sql: "SELECT * FROM program_sessions WHERE program_id = ? ORDER BY order_idx", args: [programId] })).rows;
  const ex = (await prod.execute({ sql: "SELECT * FROM program_exercises WHERE program_id = ? AND deleted_at IS NULL ORDER BY session_code, order_idx", args: [programId] })).rows;
  return {
    id: unscope(u.id, p.id), name: p.name, weeks: p.weeks, hasDeload: p.has_deload === 1,
    status: p.status, createdAt: p.created_at,
    sessions: ses.map((s) => ({ id: s.code, name: s.name })),
    exercises: ex.map((e) => ({
      id: unscope(u.id, e.id), session: e.session_code, order: e.order_idx, name: e.name,
      group: e.muscle_group, sets: e.sets, refKg: e.ref_kg, repsMin: e.reps_min, repsMax: e.reps_max,
      tempo: e.tempo, rest: e.rest_sec, rir: e.rir_target, unit: e.rep_unit,
      superset: e.superset_with ? unscope(u.id, e.superset_with) : null,
      exerciseId: e.exercise_id ? unscope(u.id, e.exercise_id) : null,
      description: e.description || "",
    })),
  };
};

console.log("\n--- push de una sesion por cada programa (como al cerrar el entrenamiento) ---");
let fallas = 0;
for (const meta of programas) {
  const programa = await traer(meta.id);
  const primeraSesion = programa.sessions[0];
  if (!primeraSesion) { console.log(`  (salteado) ${programa.name}: sin sesiones`); continue; }

  const ejercicios = programa.exercises.filter((e) => e.session === primeraSesion.id).slice(0, 3);
  const entry = {
    id: "repro", programId: programa.id, week: "3", session: primeraSesion.id,
    sessionName: primeraSesion.name, date: Date.now(), duration: 66,
    health: { sleep: 4, stress: 2, energy: 4 },
    note: "Bien. Solo no terminé porque estaba lleno el gim",
    exercises: ejercicios.map((e) => ({
      id: e.id, name: e.name, group: e.group,
      sets: [{ setN: 1, kg: 60, reps: 10, rir: 2 }],
    })),
  };

  try {
    const r = await pushForUser(usuario.id, { program: programa, entry });
    const guardado = await getProgram(`${usuario.id}~${programa.id}`);
    console.log(`  ok   ${programa.name} — ${r.sets} series, ${guardado.exercises.length} ejercicios`);
  } catch (e) {
    fallas++;
    console.error(`  FALLA ${programa.name}`);
    console.error(`        ${e.message}`);
    if (e.cause) console.error(`        causa: ${e.cause.message ?? e.cause}`);
  }
}

console.log(fallas ? `\n${fallas} programa(s) hacen fallar el push.` : "\nEl push no falla con estos datos.");
process.exit(fallas ? 1 : 0);
