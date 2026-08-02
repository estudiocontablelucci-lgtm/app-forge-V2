/**
 * Verifica las metricas de la ficha del alumno.
 *
 *   node scripts/verify-coach-metrics.mjs
 *
 * Dos mitades. La primera ejercita las funciones puras de `lib/coach/metrics.js`
 * (adherencia, desvio de RIR, e1RM, tonelaje). La segunda arma un entrenador y
 * un alumno de verdad sobre una base descartable y recorre el camino completo
 * hasta la ficha — que es donde estaba el riesgo real: la traduccion de ids
 * entre el coach y el servidor no rompe nada, solo devuelve todo en cero.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-coach-metrics.db");
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

const M = await import("../lib/coach/metrics.js");
const users = await import("../lib/repo/users.js");
const co = await import("../lib/repo/coaching.js");
const progs = await import("../lib/repo/programs.js");
const tr = await import("../lib/repo/training.js");
const { scope, unscope, unscopeProgram } = await import("../lib/sync/ids.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.stack}`); }
};

const DIA = 86400000;
const AHORA = Date.parse("2026-08-02T18:00:00.000Z");

/* ================= funciones puras ================= */

console.log("\nmetricas puras");

await check("el objetivo de RIR se lee tanto '2-3' como '2'", async () => {
  const r = M.parseRirObjetivo("2-3");
  if (r.min !== 2 || r.max !== 3) return `"2-3" dio ${JSON.stringify(r)}`;
  const u = M.parseRirObjetivo("2");
  if (u.min !== 2 || u.max !== 2) return `"2" dio ${JSON.stringify(u)}`;
  if (M.parseRirObjetivo(null) !== null) return "null deberia no tener objetivo";
  if (M.parseRirObjetivo("libre") !== null) return "texto sin numeros deberia no tener objetivo";
  return true;
});

await check("el desvio se mide contra el borde del rango, no contra el medio", async () => {
  const obj = { min: 2, max: 3 };
  // Dentro del rango no hay desvio: un objetivo "2-3" cumplido con 3 esta bien.
  if (M.desvioRir(3, obj) !== 0) return `RIR 3 con objetivo 2-3 dio ${M.desvioRir(3, obj)}`;
  if (M.desvioRir(2, obj) !== 0) return "RIR 2 con objetivo 2-3 deberia estar en objetivo";
  if (M.desvioRir(4.5, obj) !== 1.5) return `RIR 4.5 deberia desviar +1.5, dio ${M.desvioRir(4.5, obj)}`;
  if (M.desvioRir(0.5, obj) !== -1.5) return `RIR 0.5 deberia desviar -1.5, dio ${M.desvioRir(0.5, obj)}`;
  return true;
});

await check("un desvio de exactamente 1 punto NO dispara la alerta", async () => {
  const ejercicios = [{ id: "e1", name: "Press banca", rir: "2-3" }];
  const sets = [1, 2, 3].map((n) => ({ programExerciseId: "e1", week: "1", setNumber: n, rir: 4 }));
  const a = M.alertasRir(sets, ejercicios);
  if (a.length) return `RIR 4 con objetivo 2-3 desvia 1 exacto y no deberia alertar, alerto ${JSON.stringify(a)}`;
  return true;
});

await check("carga liviana: reporta mas reserva de la pedida", async () => {
  const ejercicios = [{ id: "e1", name: "Press banca", rir: "2-3" }];
  const sets = [4.5, 4.5, 4.5].map((rir, i) => ({ programExerciseId: "e1", week: "2", setNumber: i + 1, rir }));
  const [a] = M.alertasRir(sets, ejercicios);
  if (!a) return "no alerto con desvio de 1.5";
  if (a.sentido !== "liviano") return `sentido fue '${a.sentido}', esperaba 'liviano'`;
  if (a.desvio !== 1.5) return `desvio fue ${a.desvio}`;
  return true;
});

await check("carga pesada: reporta menos reserva de la pedida", async () => {
  const ejercicios = [{ id: "e1", name: "Prensa 45", rir: "2-3" }];
  const sets = [0, 0, 0].map((rir, i) => ({ programExerciseId: "e1", week: "2", setNumber: i + 1, rir }));
  const [a] = M.alertasRir(sets, ejercicios);
  if (!a) return "no alerto con RIR 0 sobre objetivo 2-3";
  if (a.sentido !== "pesado") return `sentido fue '${a.sentido}'`;
  return true;
});

await check("la alerta mira la semana mas reciente, no promedia todo el ciclo", async () => {
  const ejercicios = [{ id: "e1", name: "Remo", rir: "2-3" }];
  const sets = [
    // Semana 1 muy desviada, ya corregida.
    { programExerciseId: "e1", week: "1", setNumber: 1, rir: 6 },
    { programExerciseId: "e1", week: "1", setNumber: 2, rir: 6 },
    // Semana 3 en objetivo: no tiene que alertar.
    { programExerciseId: "e1", week: "3", setNumber: 1, rir: 2.5 },
    { programExerciseId: "e1", week: "3", setNumber: 2, rir: 2.5 },
  ];
  const a = M.alertasRir(sets, ejercicios);
  if (a.length) return `promedio todo el ciclo en vez de la semana 3: ${JSON.stringify(a)}`;
  return true;
});

await check("un ejercicio sin objetivo de RIR nunca alerta", async () => {
  const sets = [{ programExerciseId: "e1", week: "1", setNumber: 1, rir: 9 }];
  if (M.alertasRir(sets, [{ id: "e1", name: "Caminata", rir: null }]).length) return "alerto sin objetivo";
  return true;
});

await check("adherencia: cuenta solo la ventana de 7 dias", async () => {
  const ses = [
    { week: "2", session: "A", date: new Date(AHORA - 1 * DIA).toISOString() },
    { week: "2", session: "B", date: new Date(AHORA - 5 * DIA).toISOString() },
    { week: "1", session: "C", date: new Date(AHORA - 9 * DIA).toISOString() }, // fuera
  ];
  const a = M.adherencia(ses, 3, AHORA);
  if (a.hechas !== 2) return `hechas fue ${a.hechas}, esperaba 2`;
  if (a.programadas !== 3) return `programadas fue ${a.programadas}`;
  if (a.pct !== 67) return `pct fue ${a.pct}, esperaba 67`;
  return true;
});

await check("sin programa asignado la adherencia no inventa un porcentaje", async () => {
  const a = M.adherencia([], 0, AHORA);
  if (a.pct !== null) return `pct fue ${a.pct}, esperaba null`;
  return true;
});

await check("tonelaje: BW y pasos quedan fuera, el resto suma kg x reps", async () => {
  const ejercicios = [
    { id: "e1", name: "Press", unit: "reps" },
    { id: "e2", name: "Dominadas", unit: "reps" },
    { id: "e3", name: "Farmer walk", unit: "pasos" },
  ];
  const sets = [
    { programExerciseId: "e1", week: "1", kg: 60, reps: 10 },   // 600
    { programExerciseId: "e1", week: "1", kg: 60, reps: 8 },    // 480
    { programExerciseId: "e2", week: "1", kg: null, reps: 8 },  // BW, no suma
    { programExerciseId: "e3", week: "1", kg: 30, reps: 20 },   // pasos, no suma
    { programExerciseId: "e1", week: "2", kg: 65, reps: 10 },   // 650
  ];
  const t = M.tonelajePorSemana(sets, ejercicios);
  if (t["1"] !== 1080) return `semana 1 dio ${t["1"]}, esperaba 1080`;
  if (t["2"] !== 650) return `semana 2 dio ${t["2"]}`;
  return true;
});

await check("e1RM: el mejor de la semana y el delta del ciclo", async () => {
  const ejercicios = [{ id: "e1", name: "Press banca", unit: "reps" }];
  const sets = [
    { programExerciseId: "e1", exerciseName: "Press banca", week: "1", kg: 60, reps: 10 },
    { programExerciseId: "e1", exerciseName: "Press banca", week: "1", kg: 60, reps: 8 },
    { programExerciseId: "e1", exerciseName: "Press banca", week: "3", kg: 65, reps: 10 },
  ];
  const [f] = M.e1rmPorEjercicio(sets, ejercicios);
  // Brzycki: 60*36/(37-10) = 80; 60*36/(37-8) = 74.5 -> gana el de 10 reps.
  if (f.porSemana["1"] !== 80) return `semana 1 dio ${f.porSemana["1"]}, esperaba 80`;
  if (f.porSemana["3"] !== 87) return `semana 3 dio ${f.porSemana["3"]}, esperaba 87`;
  if (f.delta !== 7) return `delta dio ${f.delta}, esperaba 7`;
  return true;
});

await check("un ejercicio con una sola semana no muestra delta", async () => {
  const sets = [{ programExerciseId: "e1", exerciseName: "Press", week: "1", kg: 60, reps: 10 }];
  const [f] = M.e1rmPorEjercicio(sets, [{ id: "e1", name: "Press", unit: "reps" }]);
  if (f.delta !== null) return `delta fue ${f.delta}, esperaba null`;
  return true;
});

await check("el ejercicio que salio del programa sigue en la tabla, marcado", async () => {
  const sets = [{ programExerciseId: "viejo", exerciseName: "Belt squat", week: "1", kg: 100, reps: 5 }];
  const [f] = M.e1rmPorEjercicio(sets, [{ id: "e1", name: "Pendular", unit: "reps" }]);
  if (!f) return "desaparecio de la tabla un ejercicio con series hechas";
  if (!f.retirado) return "no quedo marcado como retirado";
  if (f.name !== "Belt squat") return `perdio el nombre con el que se entreno: ${f.name}`;
  return true;
});

await check("la semana de deload va al final, no antes de la 1", async () => {
  if (M.ordenSemana("DL") <= M.ordenSemana("4")) return "DL quedo antes que la semana 4";
  if (M.semanaEnCurso([{ week: "2" }, { week: "DL" }, { week: "1" }]) !== "DL") return "no tomo DL como la mas avanzada";
  return true;
});

/* ================= camino completo ================= */

console.log("\ncamino completo coach -> alumno -> ficha");

const coachUser = await users.findOrCreate({ email: "coach@forge.test", displayName: "Entrenador" });
const alumno = await users.findOrCreate({ email: "ana@forge.test", displayName: "Ana Torres" });

const inv = await co.invitar({ ownerUserId: coachUser.id, email: "ana@forge.test", nombreCoach: "Estudio" });
await co.aceptarInvitacion({ token: inv.token, userId: alumno.id, email: "ana@forge.test" });
const coach = await co.getCoachDe(coachUser.id);

// El programa entra como entra siempre: con los ids prefijados por su dueno.
const PROGRAMA_LOCAL = {
  id: "p1",
  name: "Hipertrofia 4 sem",
  weeks: 4,
  hasDeload: true,
  sessions: [{ id: "A", name: "Torso" }, { id: "B", name: "Pierna" }, { id: "C", name: "Full" }],
  exercises: [
    { id: "a1", session: "A", order: 1, name: "Press banca", group: "Pecho", sets: 3, refKg: 60, repsMin: 8, repsMax: 10, rir: "2-3", unit: "reps" },
    { id: "a2", session: "A", order: 2, name: "Remo", group: "Espalda", sets: 3, refKg: 50, repsMin: 8, repsMax: 10, rir: "2-3", unit: "reps" },
  ],
};
const remoto = {
  ...PROGRAMA_LOCAL,
  id: scope(coachUser.id, PROGRAMA_LOCAL.id),
  exercises: PROGRAMA_LOCAL.exercises.map((e) => ({ ...e, id: scope(coachUser.id, e.id) })),
};
await progs.saveProgram(coachUser.id, remoto);

let asignacion = null;

await check("asignar el programa del coach al alumno", async () => {
  const r = await tr.asignarPrograma({
    programId: remoto.id, athleteId: alumno.id,
    coachUserId: coachUser.id, coachId: coach.id,
  });
  if (!r.ok) return `no asigno: ${r.motivo}`;
  asignacion = await tr.asignacionDeMiAlumno({ athleteId: alumno.id, coachUserId: coachUser.id });
  if (!asignacion) return "la asignacion no aparece del lado del coach";
  return true;
});

await check("el coach NO ve el programa que le asigno otro entrenador", async () => {
  const otro = await users.findOrCreate({ email: "otro@forge.test", displayName: "Otro" });
  const suyo = { ...PROGRAMA_LOCAL, id: scope(otro.id, "p9"), exercises: [] };
  await progs.saveProgram(otro.id, suyo);
  await tr.ensureAssignment({ programId: suyo.id, athleteId: alumno.id, assignedBy: otro.id });
  const mia = await tr.asignacionDeMiAlumno({ athleteId: alumno.id, coachUserId: coachUser.id });
  if (mia.programId !== remoto.id) return `devolvio el programa de otro: ${mia.programId}`;
  return true;
});

// El alumno entrena. Sus series apuntan al ejercicio del COACH: el id ya viene
// prefijado y `scope` no lo vuelve a prefijar.
const cycleId = await tr.ensureCycle({ assignmentId: asignacion.assignmentId, athleteId: alumno.id });

await check("el alumno registra dos sesiones, una con nota", async () => {
  await tr.saveSession({
    cycleId, athleteId: alumno.id, week: "1", sessionCode: "A", sessionName: "Torso",
    performedAt: new Date(AHORA - 4 * DIA).toISOString(), durationMin: 62,
    health: { sleep: 4, stress: 2, energy: 4 },
    note: "El press me quedo corto, subi 2.5kg en la ultima.",
    sets: [
      { programExerciseId: scope(alumno.id, remoto.exercises[0].id), exerciseName: "Press banca", setNumber: 1, kg: 60, reps: 10, rir: 4 },
      { programExerciseId: scope(alumno.id, remoto.exercises[0].id), exerciseName: "Press banca", setNumber: 2, kg: 60, reps: 10, rir: 5 },
      { programExerciseId: scope(alumno.id, remoto.exercises[1].id), exerciseName: "Remo", setNumber: 1, kg: 50, reps: 10, rir: 2 },
    ],
  });
  await tr.saveSession({
    cycleId, athleteId: alumno.id, week: "2", sessionCode: "A", sessionName: "Torso",
    performedAt: new Date(AHORA - 1 * DIA).toISOString(), durationMin: 58,
    health: { sleep: 3, stress: 3, energy: 3 },
    sets: [
      { programExerciseId: scope(alumno.id, remoto.exercises[0].id), exerciseName: "Press banca", setNumber: 1, kg: 65, reps: 10, rir: 3 },
    ],
  });
  const { sesiones, sets } = await tr.loQueEntreno(asignacion.assignmentId);
  if (sesiones.length !== 2) return `guardo ${sesiones.length} sesiones`;
  if (sets.length !== 4) return `guardo ${sets.length} series`;
  return true;
});

await check("las series del alumno apuntan al ejercicio DEL COACH, no a uno propio", async () => {
  const { sets } = await tr.loQueEntreno(asignacion.assignmentId);
  const propio = sets.find((s) => String(s.programExerciseId).startsWith(`${alumno.id}~`));
  if (propio) return `una serie quedo colgada de un id del alumno: ${propio.programExerciseId}`;
  return true;
});

await check("la nota de la sesion llega entera", async () => {
  const { sesiones } = await tr.loQueEntreno(asignacion.assignmentId);
  const con = sesiones.find((s) => s.note);
  if (!con) return "no volvio ninguna nota";
  if (!con.note.includes("quedo corto")) return `nota inesperada: ${con.note}`;
  return true;
});

let ficha = null;

await check("la ficha se arma con los ids que ve el coach y NO queda en cero", async () => {
  const completo = await progs.getProgram(asignacion.programId);
  const programa = unscopeProgram(coachUser.id, completo);
  const { sesiones, sets } = await tr.loQueEntreno(asignacion.assignmentId);

  ficha = M.fichaDeAlumno({
    programa,
    sesiones,
    sets: sets.map((x) => ({ ...x, programExerciseId: unscope(coachUser.id, x.programExerciseId) })),
    ahora: AHORA,
  });

  // Este es el bug que ya mordio: sin alinear los ids no explota nada, la
  // ficha simplemente muestra que el alumno no entreno.
  if (!ficha.e1rm.length) return "la tabla de e1RM quedo vacia con series cargadas";
  const press = ficha.e1rm.find((f) => f.name === "Press banca");
  if (!press) return "no encontro el press banca por id";
  if (press.retirado) return "dio el press como retirado: los ids no matchearon";
  return true;
});

await check("semana en curso y ultimo entrenamiento", async () => {
  if (ficha.semanaEnCurso !== "2") return `semana en curso dio ${ficha.semanaEnCurso}`;
  if (!ficha.ultimo) return "no hay ultimo entrenamiento";
  if (ficha.ultimo.week !== "2") return `el ultimo fue de la semana ${ficha.ultimo.week}`;
  if (ficha.ultimo.duration !== 58) return `duracion ${ficha.ultimo.duration}`;
  return true;
});

await check("adherencia sobre las sesiones del programa", async () => {
  // 3 sesiones por semana en el programa, 2 entrenadas en los ultimos 7 dias.
  if (ficha.adherencia.programadas !== 3) return `programadas ${ficha.adherencia.programadas}`;
  if (ficha.adherencia.hechas !== 2) return `hechas ${ficha.adherencia.hechas}`;
  return true;
});

await check("el tonelaje sale por semana y ordenado", async () => {
  const s1 = ficha.tonelaje.find((t) => t.week === "1");
  const s2 = ficha.tonelaje.find((t) => t.week === "2");
  if (s1?.kg !== 1700) return `semana 1 dio ${s1?.kg}, esperaba 1700`;   // 600+600+500
  if (s2?.kg !== 650) return `semana 2 dio ${s2?.kg}, esperaba 650`;
  if (ficha.tonelaje[0].week !== "1") return "no quedo ordenado por semana";
  return true;
});

await check("la alerta de RIR aparece con el nombre real del ejercicio", async () => {
  // Semana 2 del press: RIR 3 sobre objetivo 2-3, en objetivo. La semana 1
  // (4 y 5) ya quedo atras, asi que no tiene que alertar.
  const press = ficha.alertasRir.find((a) => a.name === "Press banca");
  if (press) return `alerto sobre la semana vieja: ${JSON.stringify(press)}`;
  return true;
});

await check("las notas vuelven ordenadas y sin las sesiones sin nota", async () => {
  if (ficha.notas.length !== 1) return `devolvio ${ficha.notas.length} notas, esperaba 1`;
  if (ficha.notas[0].week !== "1") return "la nota quedo atada a la sesion equivocada";
  return true;
});

/* ---------- duplicar ---------- */

console.log("\nduplicar y asignar");

await check("duplicar copia el programa con ids nuevos y prefijados", async () => {
  const r = await progs.duplicarPrograma({ programId: remoto.id, ownerUserId: coachUser.id, nombre: "Hipertrofia · Beto" });
  if (!r.ok) return `no duplico: ${r.motivo}`;
  if (r.programa.id === remoto.id) return "reuso el id del original";
  if (!r.programa.id.startsWith(`${coachUser.id}~`)) {
    return `el id de la copia no vino prefijado (${r.programa.id}): el push siguiente crearia un programa fantasma`;
  }
  if (r.programa.exercises.length !== 2) return `la copia tiene ${r.programa.exercises.length} ejercicios`;
  const compartido = r.programa.exercises.find((e) => remoto.exercises.some((o) => o.id === e.id));
  if (compartido) return `un ejercicio de la copia comparte id con el original: ${compartido.id}`;
  return true;
});

await check("editar la copia no toca el original", async () => {
  const original = await progs.getProgram(remoto.id);
  if (original.name !== "Hipertrofia 4 sem") return `el original se renombro a "${original.name}"`;
  if (original.exercises.length !== 2) return "el original perdio ejercicios";
  return true;
});

await check("no se puede duplicar un programa ajeno", async () => {
  const otro = await users.findOrCreate({ email: "ajeno@forge.test", displayName: "Ajeno" });
  const r = await progs.duplicarPrograma({ programId: remoto.id, ownerUserId: otro.id });
  if (r.ok) return "duplico un programa de otro usuario";
  return true;
});

await check("dar de baja corta el acceso del coach a la ficha", async () => {
  await co.darDeBaja({ coachId: coach.id, athleteId: alumno.id });
  if (await co.puedeVer({ coachId: coach.id, athleteId: alumno.id })) return "sigue pudiendo verlo";
  // Y no se borro nada: sus sesiones siguen ahi.
  const { sesiones } = await tr.loQueEntreno(asignacion.assignmentId);
  if (sesiones.length !== 2) return "la baja se llevo puesto el historial del alumno";
  return true;
});

/* ================= cierre ================= */

if (fallas.length) {
  console.error(`\n${fallas.length} falla(s):`);
  for (const f of fallas) console.error(`  FALLA  ${f}`);
  process.exit(1);
}
console.log("\ntodo ok");
