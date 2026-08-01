/**
 * Verifica los invariantes del schema v01 sobre una base descartable.
 *
 *   node scripts/verify-schema.mjs
 *
 * No usa la base de desarrollo: crea db/verify.db desde cero, corre las
 * migraciones y prueba lo que tiene que ser cierto. Sale con 1 si algo falla.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify.db");
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }

const db = createClient({ url: `file:${dbPath}` });
await db.execute("PRAGMA foreign_keys = ON");
for (const f of readdirSync(resolve(root, "db")).filter((f) => /^v\d+_.*\.sql$/.test(f)).sort()) {
  const stmts = readFileSync(resolve(root, "db", f), "utf8")
    .split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  await db.batch(stmts, "write");
}

const T = "2026-07-30T12:00:00.000Z";
const fallas = [];
const check = async (label, fn) => {
  try { const r = await fn(); if (r !== true) fallas.push(`${label}: ${r}`); else console.log(`  ok  ${label}`); }
  catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

// ---------- Semilla: un entrenador con 2 alumnos + un atleta independiente ----------
const ins = (sql, args) => db.execute({ sql, args });
await ins("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["u-coach", "coach@x.com", "Entrenador", "coach", T, T]);
await ins("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["u-ana", "ana@x.com", "Ana", "athlete", T, T]);
await ins("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["u-beto", "beto@x.com", "Beto", "athlete", T, T]);
await ins("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["u-solo", "solo@x.com", "Independiente", "athlete", T, T]);

await ins("INSERT INTO coaches (id,owner_user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)", ["c1", "u-coach", "Estudio", T, T]);
for (const a of ["u-ana", "u-beto"]) {
  await ins("INSERT INTO coach_athletes (coach_id,athlete_id,status,invited_at,accepted_at,updated_at) VALUES (?,?,?,?,?,?)", ["c1", a, "active", T, T, T]);
}

// Un programa del entrenador, asignado a los DOS alumnos.
await ins("INSERT INTO programs (id,owner_user_id,coach_id,name,weeks,has_deload,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", ["p1", "u-coach", "c1", "Fullbody DUP", 4, 1, "active", T, T]);
await ins("INSERT INTO program_sessions (id,program_id,code,name,order_idx,updated_at) VALUES (?,?,?,?,?,?)", ["ps1", "p1", "A", "Volumen", 1, T]);
await ins("INSERT INTO program_exercises (id,program_id,session_code,order_idx,name,sets,ref_kg,reps_min,reps_max,technique,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ["pe1", "p1", "A", 1, "Press Plano", 3, "60", 8, 10, null, T]);
await ins("INSERT INTO program_exercises (id,program_id,session_code,order_idx,name,sets,ref_kg,reps_min,reps_max,technique,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", ["pe2", "p1", "A", 2, "Gemelo sentado", 3, "45", 12, 15, "DS", T]);

for (const [id, ath] of [["as-ana", "u-ana"], ["as-beto", "u-beto"]]) {
  await ins("INSERT INTO assignments (id,program_id,athlete_id,assigned_by,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [id, "p1", ath, "u-coach", "active", T, T]);
}

// El entrenador calibra por alumno: Ana mas fuerte, y en Sem 4 le sube todavia mas.
await ins("INSERT INTO assignment_refs (assignment_id,program_exercise_id,week,ref_kg,updated_at) VALUES (?,?,?,?,?)", ["as-ana", "pe1", "*", "70", T]);
await ins("INSERT INTO assignment_refs (assignment_id,program_exercise_id,week,ref_kg,updated_at) VALUES (?,?,?,?,?)", ["as-ana", "pe1", "4", "75", T]);
await ins("INSERT INTO assignment_refs (assignment_id,program_exercise_id,week,ref_kg,sets,updated_at) VALUES (?,?,?,?,?,?)", ["as-beto", "pe1", "*", "50", 2, T]);

// ---------- La query de resolucion que va a usar la app ----------
const REF_SQL = `
  SELECT pe.id, pe.name,
         COALESCE(rw.ref_kg, ra.ref_kg, pe.ref_kg) AS ref_kg,
         COALESCE(rw.sets,   ra.sets,   pe.sets)   AS sets
  FROM program_exercises pe
  JOIN assignments a ON a.program_id = pe.program_id AND a.id = ?
  LEFT JOIN assignment_refs rw ON rw.assignment_id = a.id AND rw.program_exercise_id = pe.id AND rw.week = ?
  LEFT JOIN assignment_refs ra ON ra.assignment_id = a.id AND ra.program_exercise_id = pe.id AND ra.week = '*'
  WHERE pe.deleted_at IS NULL
  ORDER BY pe.session_code, pe.order_idx`;
const refs = async (assignment, week) =>
  Object.fromEntries((await db.execute({ sql: REF_SQL, args: [assignment, week] })).rows.map((r) => [r.name, { ref: r.ref_kg, sets: r.sets }]));

await check("mismo programa, refs distintas por alumno", async () => {
  const ana = await refs("as-ana", "1"), beto = await refs("as-beto", "1");
  if (ana["Press Plano"].ref !== "70") return `Ana esperaba 70, obtuvo ${ana["Press Plano"].ref}`;
  if (beto["Press Plano"].ref !== "50") return `Beto esperaba 50, obtuvo ${beto["Press Plano"].ref}`;
  return true;
});

await check("ref por semana gana sobre la general", async () => {
  const s4 = await refs("as-ana", "4");
  return s4["Press Plano"].ref === "75" || `esperaba 75 en Sem 4, obtuvo ${s4["Press Plano"].ref}`;
});

await check("sin override cae a la plantilla", async () => {
  const ana = await refs("as-ana", "1");
  return ana["Gemelo sentado"].ref === "45" || `esperaba 45, obtuvo ${ana["Gemelo sentado"].ref}`;
});

await check("override de sets es independiente del de ref", async () => {
  const beto = await refs("as-beto", "1"), ana = await refs("as-ana", "1");
  if (Number(beto["Press Plano"].sets) !== 2) return `Beto esperaba 2 series, obtuvo ${beto["Press Plano"].sets}`;
  if (Number(ana["Press Plano"].sets) !== 3) return `Ana esperaba 3 series (plantilla), obtuvo ${ana["Press Plano"].sets}`;
  return true;
});

await check("atleta independiente: programa propio sin coach", async () => {
  await ins("INSERT INTO programs (id,owner_user_id,coach_id,name,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["p-solo", "u-solo", null, "Mi programa", T, T]);
  const r = await db.execute({ sql: "SELECT coach_id FROM programs WHERE id=?", args: ["p-solo"] });
  return r.rows[0].coach_id === null || "coach_id deberia ser NULL";
});

await check("el log sobrevive al borrado del ejercicio", async () => {
  await ins("INSERT INTO cycles (id,assignment_id,athlete_id,label,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["cy1", "as-ana", "u-ana", "C1", T, T]);
  await ins("INSERT INTO set_logs (id,cycle_id,athlete_id,program_exercise_id,exercise_name,week,session_code,set_number,kg,reps,e1rm,logged_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", ["sl1", "cy1", "u-ana", "pe2", "Gemelo sentado", "1", "A", 1, 45, 15, 73.6, T, T]);
  await db.execute({ sql: "DELETE FROM program_exercises WHERE id=?", args: ["pe2"] });
  const r = await db.execute({ sql: "SELECT exercise_name, program_exercise_id, kg FROM set_logs WHERE id=?", args: ["sl1"] });
  if (!r.rows.length) return "el log se borro en cascada";
  if (r.rows[0].program_exercise_id !== null) return "program_exercise_id deberia quedar NULL";
  return r.rows[0].exercise_name === "Gemelo sentado" || "se perdio el nombre desnormalizado";
});

await check("borrar la asignacion se lleva sus refs", async () => {
  await db.execute({ sql: "DELETE FROM assignments WHERE id=?", args: ["as-beto"] });
  const r = await db.execute({ sql: "SELECT COUNT(*) n FROM assignment_refs WHERE assignment_id=?", args: ["as-beto"] });
  return Number(r.rows[0].n) === 0 || `quedaron ${r.rows[0].n} refs huerfanas`;
});

await check("email duplicado rechazado", async () => {
  try {
    await ins("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["u-dup", "ana@x.com", "Otra Ana", "athlete", T, T]);
    return "acepto un email duplicado";
  } catch { return true; }
});

await check("rol invalido rechazado", async () => {
  try {
    await ins("INSERT INTO users (id,email,display_name,role,created_at,updated_at) VALUES (?,?,?,?,?,?)", ["u-bad", "bad@x.com", "X", "administrador", T, T]);
    return "acepto un rol fuera del CHECK";
  } catch { return true; }
});

await check("pull incremental por updated_at", async () => {
  const r = await db.execute({ sql: "SELECT COUNT(*) n FROM set_logs WHERE updated_at > ?", args: ["2026-07-30T11:00:00.000Z"] });
  return Number(r.rows[0].n) === 1 || `esperaba 1 fila modificada, obtuvo ${r.rows[0].n}`;
});

console.log("");
if (fallas.length) {
  console.error(`FALLA — ${fallas.length}:`);
  for (const f of fallas) console.error(`  ${f}`);
  process.exit(1);
}
console.log("OK  schema v01: resolucion de refs, multi-alumno, cascadas y constraints");
