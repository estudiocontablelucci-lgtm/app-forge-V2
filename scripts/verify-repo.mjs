/**
 * Verifica la capa de datos (lib/repo/*) contra una base descartable.
 *
 *   node scripts/verify-repo.mjs
 *
 * No usa la base de desarrollo ni la remota: crea db/verify-repo.db desde cero,
 * corre las migraciones y ejercita los repositorios REALES — no una copia de su
 * logica. Sale con 1 si algo falla.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-repo.db");
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }

// Los repos leen DATABASE_URL al abrir la conexion: se apunta a la base
// descartable ANTES de importarlos.
process.env.DATABASE_URL = `file:${dbPath}`;
delete process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url: process.env.DATABASE_URL });
await db.execute("PRAGMA foreign_keys = ON");
for (const f of readdirSync(resolve(root, "db")).filter((f) => /^v\d+_.*\.sql$/.test(f)).sort()) {
  const stmts = readFileSync(resolve(root, "db", f), "utf8")
    .split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  await db.batch(stmts, "write");
}

const users = await import("../lib/repo/users.js");
const programs = await import("../lib/repo/programs.js");
const training = await import("../lib/repo/training.js");
const { brzycki } = await import("../lib/formulas.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

/* ---------- usuarios ---------- */

let atleta, coach;

await check("findOrCreate crea el usuario una sola vez", async () => {
  atleta = await users.findOrCreate({ email: "Agustin@Example.com ", displayName: "Agustin" });
  const otra = await users.findOrCreate({ email: "agustin@example.com", displayName: "Otro nombre" });
  if (atleta.id !== otra.id) return "creo dos usuarios para el mismo email";
  if (atleta.email !== "agustin@example.com") return `email sin normalizar: ${atleta.email}`;
  if (otra.displayName !== "Agustin") return "el segundo login piso el display_name";
  return true;
});

await check("updateProfile cambia solo lo que recibe", async () => {
  const u = await users.updateProfile(atleta.id, { bodyWeightKg: 78.5 });
  if (u.bodyWeightKg !== 78.5) return "no guardo el peso";
  if (u.displayName !== "Agustin") return "piso el nombre";
  return true;
});

/* ---------- programas ---------- */

const PROGRAMA = {
  id: "prog1",
  name: "Ciclo 2 DUP",
  weeks: 4,
  hasDeload: true,
  sessions: [{ id: "A", name: "Volumen & Tempo" }, { id: "B", name: "Intensidad" }],
  exercises: [
    { id: "e1", session: "A", order: 1, name: "Sentadilla pendular", group: "Cuadriceps", sets: 3, refKg: null, repsMin: 8, repsMax: 10, tempo: "3-1-1-0", rest: 150, rir: "2-3", superset: null, unit: "reps", description: "REVISAR ref" },
    { id: "e2", session: "A", order: 2, name: "Sillon de cuadriceps", group: "Cuadriceps", sets: 3, refKg: 60, repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90, rir: "2-3", superset: "e3", unit: "reps", description: "" },
    { id: "e3", session: "A", order: 3, name: "Camilla isquios", group: "Isquios", sets: 3, refKg: 50, repsMin: 10, repsMax: 12, tempo: "2-0-1-1", rest: 90, rir: "2-3", superset: "e2", unit: "reps", description: "" },
    { id: "e4", session: "B", order: 1, name: "Dominadas", group: "Espalda", sets: 4, refKg: "BW", repsMin: 6, repsMax: 8, tempo: "2-0-1-0", rest: 120, rir: "1-2", superset: null, unit: "reps", description: "" },
  ],
};

await check("saveProgram guarda y devuelve el programa completo", async () => {
  const p = await programs.saveProgram(atleta.id, PROGRAMA);
  if (p.exercises.length !== 4) return `${p.exercises.length} ejercicios, esperaba 4`;
  if (p.sessions.length !== 2) return `${p.sessions.length} sesiones, esperaba 2`;
  if (p.hasDeload !== true) return "perdio hasDeload";
  return true;
});

await check("superserie mutua sobrevive al round-trip", async () => {
  const p = await programs.getProgram("prog1");
  const e2 = p.exercises.find((e) => e.id === "e2");
  const e3 = p.exercises.find((e) => e.id === "e3");
  if (e2.superset !== "e3" || e3.superset !== "e2") return `vinculos rotos: ${e2.superset} / ${e3.superset}`;
  return true;
});

await check("refKg conserva numero, null y BW", async () => {
  const p = await programs.getProgram("prog1");
  const byId = Object.fromEntries(p.exercises.map((e) => [e.id, e.refKg]));
  if (byId.e1 !== null) return `e1 deberia ser null y es ${JSON.stringify(byId.e1)}`;
  if (byId.e2 !== 60) return `e2 deberia ser 60 (number) y es ${JSON.stringify(byId.e2)}`;
  if (byId.e4 !== "BW") return `e4 deberia ser "BW" y es ${JSON.stringify(byId.e4)}`;
  return true;
});

await check("guardar de nuevo actualiza sin duplicar y sube version", async () => {
  const mod = { ...PROGRAMA, name: "Ciclo 2 DUP (v2)", exercises: PROGRAMA.exercises.map((e) => e.id === "e2" ? { ...e, refKg: 65 } : e) };
  const p = await programs.saveProgram(atleta.id, mod);
  if (p.exercises.length !== 4) return `duplico ejercicios: ${p.exercises.length}`;
  if (p.name !== "Ciclo 2 DUP (v2)") return "no actualizo el nombre";
  if (p.version !== 2) return `version deberia ser 2 y es ${p.version}`;
  if (p.exercises.find((e) => e.id === "e2").refKg !== 65) return "no actualizo refKg";
  return true;
});

await check("quitar un ejercicio lo elimina del programa", async () => {
  const menos = { ...PROGRAMA, exercises: PROGRAMA.exercises.filter((e) => e.id !== "e4") };
  const p = await programs.saveProgram(atleta.id, menos);
  if (p.exercises.length !== 3) return `${p.exercises.length} ejercicios, esperaba 3`;
  if (p.exercises.some((e) => e.id === "e4")) return "e4 sigue estando";
  return true;
});

await check("listByOwner no ve programas de otro usuario", async () => {
  coach = await users.findOrCreate({ email: "coach@example.com", displayName: "Coach", role: "coach" });
  await programs.saveProgram(coach.id, { id: "prog2", name: "Programa del coach", sessions: [], exercises: [] });
  const mios = await programs.listByOwner(atleta.id);
  const suyos = await programs.listByOwner(coach.id);
  if (mios.length !== 1 || mios[0].id !== "prog1") return `el atleta ve ${JSON.stringify(mios.map((p) => p.id))}`;
  if (suyos.length !== 1 || suyos[0].id !== "prog2") return `el coach ve ${JSON.stringify(suyos.map((p) => p.id))}`;
  return true;
});

/* ---------- asignaciones, refs y logs ---------- */

let asignacion, ciclo;

await check("ensureAssignment / ensureCycle son idempotentes", async () => {
  asignacion = await training.ensureAssignment({ programId: "prog1", athleteId: atleta.id });
  const otra = await training.ensureAssignment({ programId: "prog1", athleteId: atleta.id });
  if (asignacion !== otra) return "creo dos asignaciones activas";
  ciclo = await training.ensureCycle({ assignmentId: asignacion, athleteId: atleta.id, label: "C2" });
  const otroCiclo = await training.ensureCycle({ assignmentId: asignacion, athleteId: atleta.id });
  if (ciclo !== otroCiclo) return "creo dos ciclos abiertos";
  return true;
});

await check("la ref del atleta pisa la de la plantilla", async () => {
  await training.setRef({ assignmentId: asignacion, programExerciseId: "e2", refKg: 72.5 });
  const refs = await training.resolveRefs(asignacion, "1");
  if (refs.e2?.refKg !== "72.5") return `esperaba 72.5 y dio ${JSON.stringify(refs.e2)}`;
  if (refs.e1) return "e1 no tiene override, no deberia aparecer";
  return true;
});

await check("la ref de la semana concreta gana sobre la general", async () => {
  await training.setRef({ assignmentId: asignacion, programExerciseId: "e2", week: "4", refKg: 80 });
  const sem4 = await training.resolveRefs(asignacion, "4");
  const sem1 = await training.resolveRefs(asignacion, "1");
  if (sem4.e2?.refKg !== "80") return `sem 4 deberia dar 80 y dio ${JSON.stringify(sem4.e2)}`;
  if (sem1.e2?.refKg !== "72.5") return `sem 1 deberia seguir en 72.5 y dio ${JSON.stringify(sem1.e2)}`;
  return true;
});

await check("dos atletas del mismo programa tienen refs independientes", async () => {
  const otro = await users.findOrCreate({ email: "alumno2@example.com", displayName: "Alumno 2" });
  const asig2 = await training.ensureAssignment({ programId: "prog1", athleteId: otro.id, assignedBy: coach.id });
  await training.setRef({ assignmentId: asig2, programExerciseId: "e2", refKg: 40 });
  const refs1 = await training.resolveRefs(asignacion, "1");
  const refs2 = await training.resolveRefs(asig2, "1");
  if (refs1.e2?.refKg !== "72.5" || refs2.e2?.refKg !== "40") {
    return `se pisaron: ${refs1.e2?.refKg} / ${refs2.e2?.refKg}`;
  }
  return true;
});

await check("saveSession guarda cabecera, series y e1RM calculado", async () => {
  await training.saveSession({
    cycleId: ciclo, athleteId: atleta.id, week: "1", sessionCode: "A",
    sessionName: "Volumen & Tempo", performedAt: "2026-08-01T14:00:00.000Z",
    durationMin: 63, health: { sleep: 4, stress: 2, energy: 4 },
    sets: [
      { programExerciseId: "e2", exerciseName: "Sillon de cuadriceps", setNumber: 1, kg: 65, reps: 10, rir: 2 },
      { programExerciseId: "e2", exerciseName: "Sillon de cuadriceps", setNumber: 2, kg: 65, reps: 9, rir: 1 },
      { programExerciseId: "e3", exerciseName: "Camilla isquios", setNumber: 1, kg: 50, reps: 12, rir: 2 },
    ],
  });
  const hist = await training.listHistory(atleta.id);
  if (hist.length !== 1) return `${hist.length} sesiones, esperaba 1`;
  if (hist[0].duration !== 63) return "perdio la duracion";
  if (hist[0].health?.sleep !== 4) return "perdio el health check";

  const sets = await training.listSets(ciclo, "1", "A");
  if (sets.length !== 3) return `${sets.length} series, esperaba 3`;
  const s1 = sets.find((s) => s.exerciseId === "e2" && s.setNumber === 1);
  const esperado = brzycki(65, 10);
  if (Math.abs(s1.e1rm - esperado) > 1e-9) return `e1rm ${s1.e1rm}, esperaba ${esperado}`;
  return true;
});

await check("re-registrar la misma sesion reemplaza en vez de duplicar", async () => {
  await training.saveSession({
    cycleId: ciclo, athleteId: atleta.id, week: "1", sessionCode: "A",
    sessionName: "Volumen & Tempo", performedAt: "2026-08-01T15:00:00.000Z",
    durationMin: 70, health: { sleep: 5, stress: 1, energy: 5 },
    sets: [{ programExerciseId: "e2", exerciseName: "Sillon de cuadriceps", setNumber: 1, kg: 70, reps: 8, rir: 1 }],
  });
  const hist = await training.listHistory(atleta.id);
  if (hist.length !== 1) return `${hist.length} sesiones, esperaba 1 (deberia reemplazar)`;
  if (hist[0].duration !== 70) return "no actualizo la cabecera";
  const sets = await training.listSets(ciclo, "1", "A");
  if (sets.length !== 1) return `${sets.length} series, esperaba 1 — quedaron huerfanas`;
  return true;
});

await check("el historial sobrevive al borrado del ejercicio", async () => {
  // e2 sale del programa: el log tiene que seguir, con el nombre desnormalizado.
  const sinE2 = { ...PROGRAMA, exercises: PROGRAMA.exercises.filter((e) => !["e2", "e4"].includes(e.id)).map((e) => e.id === "e3" ? { ...e, superset: null } : e) };
  await programs.saveProgram(atleta.id, sinE2);
  const sets = await training.listSets(ciclo, "1", "A");
  if (sets.length !== 1) return `${sets.length} series, esperaba 1`;
  if (sets[0].exerciseName !== "Sillon de cuadriceps") return "perdio el nombre del ejercicio";
  if (sets[0].exerciseId !== null) return `la FK deberia quedar en null y quedo ${sets[0].exerciseId}`;
  return true;
});

await check("el historial de un atleta no incluye el de otro", async () => {
  const hist = await training.listHistory(coach.id);
  if (hist.length !== 0) return `el coach ve ${hist.length} sesiones ajenas`;
  return true;
});

/* ---------- resultado ---------- */

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  capa de datos: usuarios, programas, refs por atleta y logs");
