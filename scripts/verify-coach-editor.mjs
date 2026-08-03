/**
 * Verifica que lo que el entrenador cambia le llegue al alumno.
 *
 *   node scripts/verify-coach-editor.mjs
 *
 * Recorre el circuito entero: el coach edita el programa asignado, el alumno
 * sincroniza y entrena la version nueva. Antes ese circuito estaba cortado en
 * dos lugares distintos y ninguno daba error — el coach editaba en otra app y
 * el merge del cliente descartaba la version del servidor.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-coach-editor.db");
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }

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
const co = await import("../lib/repo/coaching.js");
const progs = await import("../lib/repo/programs.js");
const tr = await import("../lib/repo/training.js");
const { pullForUser } = await import("../lib/sync/service.js");
const { mergePrograms } = await import("../lib/sync/client.js");
const { scope, scopeProgram, unscopeProgram } = await import("../lib/sync/ids.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

const coachUser = await users.findOrCreate({ email: "coach@ed.test", displayName: "Entrenador" });
const ana = await users.findOrCreate({ email: "ana@ed.test", displayName: "Ana" });
const otro = await users.findOrCreate({ email: "otro@ed.test", displayName: "Otro" });

const inv = await co.invitar({ ownerUserId: coachUser.id, email: "ana@ed.test" });
await co.aceptarInvitacion({ token: inv.token, userId: ana.id, email: "ana@ed.test" });
const coach = await co.getCoachDe(coachUser.id);

const LOCAL = {
  id: "p1",
  name: "Fuerza 4 sem",
  weeks: 4,
  hasDeload: true,
  sessions: [{ id: "A", name: "Torso" }],
  exercises: [
    { id: "e1", session: "A", order: 1, name: "Press banca", group: "Pecho", sets: 3, repsMin: 8, repsMax: 10, rir: "2-3", unit: "reps" },
    { id: "e2", session: "A", order: 2, name: "Remo", group: "Espalda", sets: 3, repsMin: 8, repsMax: 10, rir: "2-3", unit: "reps" },
    { id: "e3", session: "A", order: 3, name: "Curl", group: "Bíceps", sets: 2, repsMin: 10, repsMax: 12, rir: "2", unit: "reps" },
  ],
};
const remoto = scopeProgram(coachUser.id, LOCAL);
await progs.saveProgram(coachUser.id, remoto);
await tr.asignarPrograma({ programId: remoto.id, athleteId: ana.id, coachUserId: coachUser.id, coachId: coach.id });

const asignacion = await tr.asignacionDeMiAlumno({ athleteId: ana.id, coachUserId: coachUser.id });
const cycleId = await tr.ensureCycle({ assignmentId: asignacion.assignmentId, athleteId: ana.id });

await check("Ana entrena el press y el remo", async () => {
  await tr.saveSession({
    cycleId, athleteId: ana.id, week: "1", sessionCode: "A", sessionName: "Torso",
    performedAt: new Date().toISOString(), durationMin: 55,
    sets: [
      { programExerciseId: scope(ana.id, remoto.exercises[0].id), exerciseName: "Press banca", setNumber: 1, kg: 60, reps: 10, rir: 2 },
      { programExerciseId: scope(ana.id, remoto.exercises[1].id), exerciseName: "Remo", setNumber: 1, kg: 50, reps: 10, rir: 2 },
    ],
  });
  const { sets } = await tr.loQueEntreno(asignacion.assignmentId);
  return sets.length === 2 ? true : `${sets.length} series`;
});

await check("el editor sabe cuales ejercicios ya se entrenaron", async () => {
  const conSeries = await tr.ejerciciosConSeries(remoto.id);
  if (!conSeries.has(remoto.exercises[0].id)) return "no marco el press, que si tiene series";
  if (conSeries.has(remoto.exercises[2].id)) return "marco el curl, que nadie entreno";
  return true;
});

await check("solo el dueno puede tocar el programa", async () => {
  if (!(await progs.esDelUsuario(remoto.id, coachUser.id))) return "el dueno no puede";
  if (await progs.esDelUsuario(remoto.id, otro.id)) return "un tercero puede editarlo";
  if (await progs.esDelUsuario(scope(otro.id, "inexistente"), otro.id)) return "acepto un programa que no existe";
  return true;
});

let editado = null;

await check("el coach saca un ejercicio y ajusta otro", async () => {
  // Lo que hace el editor: saca el curl, le sube una serie al press.
  const nuevo = {
    ...LOCAL,
    name: "Fuerza 4 sem (ajustado)",
    exercises: [
      { ...LOCAL.exercises[0], sets: 4, rir: "1-2" },
      { ...LOCAL.exercises[1] },
    ].map((e, i) => ({ ...e, order: i + 1 })),
  };
  await progs.saveProgram(coachUser.id, scopeProgram(coachUser.id, { ...nuevo, id: remoto.id }));

  editado = unscopeProgram(coachUser.id, await progs.getProgram(remoto.id));
  if (editado.exercises.length !== 2) return `quedaron ${editado.exercises.length} ejercicios`;
  if (editado.exercises[0].sets !== 4) return "no guardo las series nuevas";
  return true;
});

await check("borrar un ejercicio entrenado NO borra el historial", async () => {
  // FK ON DELETE SET NULL: la serie sobrevive con su exercise_name.
  const { sets } = await tr.loQueEntreno(asignacion.assignmentId);
  if (sets.length !== 2) return `quedaron ${sets.length} series, esperaba 2`;
  return true;
});

await check("Ana recibe la version nueva al sincronizar", async () => {
  const { programs } = await pullForUser(ana.id);
  const suyo = programs.find((p) => p.readOnly);
  if (!suyo) return "no le llega el programa asignado";
  if (suyo.name !== "Fuerza 4 sem (ajustado)") return `le llego "${suyo.name}"`;
  if (suyo.exercises.length !== 2) return `le llegaron ${suyo.exercises.length} ejercicios`;
  if (suyo.exercises.find((e) => e.name === "Press banca").sets !== 4) return "le llego con las series viejas";
  return true;
});

await check("y el merge del cliente no se queda con la vieja", async () => {
  const { programs } = await pullForUser(ana.id);
  const remotoAna = programs.find((p) => p.readOnly);
  // Lo que Ana tenia en el telefono: la version anterior, con tres ejercicios.
  const enElTelefono = [{ ...LOCAL, id: remotoAna.id, readOnly: true }];
  const fusionado = mergePrograms(enElTelefono, programs);
  const suyo = fusionado.find((p) => p.id === remotoAna.id);
  if (suyo.name !== "Fuerza 4 sem (ajustado)") return "el telefono se quedo con la version vieja";
  if (suyo.exercises.length !== 2) return "el ejercicio borrado sigue en el telefono";
  return true;
});

await check("una sustitucion entra como ejercicio nuevo, no pisa al anterior", async () => {
  // El press tiene series. Cambiarlo por otro ejercicio no puede reusar su id:
  // encadenaria el e1RM de dos maquinas distintas.
  const conSeries = await tr.ejerciciosConSeries(remoto.id);
  const pressRemoto = remoto.exercises[0].id;
  if (!conSeries.has(pressRemoto)) return "el press deberia tener series";

  const nuevo = {
    ...LOCAL,
    exercises: [
      { id: "e9", session: "A", order: 1, name: "Press inclinado", group: "Pecho", sets: 3, repsMin: 8, repsMax: 10, rir: "2-3", unit: "reps" },
      { ...LOCAL.exercises[1], order: 2 },
    ],
  };
  await progs.saveProgram(coachUser.id, scopeProgram(coachUser.id, { ...nuevo, id: remoto.id }));

  const despues = unscopeProgram(coachUser.id, await progs.getProgram(remoto.id));
  if (despues.exercises.some((e) => e.id === "e1")) return "el press viejo sigue en el programa";
  if (!despues.exercises.some((e) => e.id === "e9")) return "no entro el sustituto";

  // Y las series del press siguen existiendo, atribuidas por nombre.
  const { sets } = await tr.loQueEntreno(asignacion.assignmentId);
  const delPress = sets.find((s) => s.exerciseName === "Press banca");
  if (!delPress) return "se perdieron las series del press";
  if (delPress.programExerciseId === scope(coachUser.id, "e9")) {
    return "las series viejas quedaron colgando del ejercicio NUEVO: el e1RM se encadeno";
  }
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  editor del entrenador: lo que cambia llega al alumno, sin pisar su historial");
