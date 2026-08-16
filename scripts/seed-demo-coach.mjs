/**
 * Arma una base de demo con un entrenador y dos alumnos, y emite las cookies de
 * sesion para entrar como cada uno.
 *
 *   DATABASE_URL=file:db/demo.db node scripts/seed-demo-coach.mjs
 *
 * Existe para poder PROBAR la seccion de entrenador en un navegador de verdad.
 * Un flujo de dos personas no se puede recorrer a mano sin dos cuentas, y los
 * ultimos bugs de esta fase (progreso en cero, refs que no llegaban) aparecieron
 * mirando la pantalla, no leyendo el codigo.
 *
 * Nunca contra produccion: si DATABASE_URL no es una base local, aborta.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const url = process.env.DATABASE_URL || "file:db/demo.db";
if (!url.startsWith("file:")) {
  console.error(`DATABASE_URL apunta a ${url}. Este script solo corre contra una base local.`);
  process.exit(1);
}
process.env.DATABASE_URL = url;
delete process.env.TURSO_AUTH_TOKEN;

const dbPath = resolve(root, url.slice("file:".length));
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }

const db = createClient({ url });
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
const { scope } = await import("../lib/sync/ids.js");

const DIA = 86400000;
const hace = (d) => new Date(Date.now() - d * DIA).toISOString();

const coachUser = await users.findOrCreate({ email: "coach@forge.test", displayName: "Gabriel Lucci" });
const ana = await users.findOrCreate({ email: "ana@forge.test", displayName: "Ana Torres" });
const beto = await users.findOrCreate({ email: "beto@forge.test", displayName: "Beto Ramirez" });

for (const [u, mail] of [[ana, "ana@forge.test"], [beto, "beto@forge.test"]]) {
  const inv = await co.invitar({ ownerUserId: coachUser.id, email: mail, nombreCoach: "Lucci Entrenamiento" });
  if (inv.ok) await co.aceptarInvitacion({ token: inv.token, userId: u.id, email: mail });
}
const coach = await co.getCoachDe(coachUser.id);

/* ---------- programa del entrenador ---------- */

const local = {
  id: "hip4",
  name: "Hipertrofia 4 sem",
  weeks: 4,
  hasDeload: true,
  sessions: [{ id: "A", name: "Torso" }, { id: "B", name: "Pierna" }, { id: "C", name: "Full body" }],
  exercises: [
    { id: "e1", session: "A", order: 1, name: "Press banca", group: "Pecho", sets: 3, refKg: 60, repsMin: 8, repsMax: 10, rir: "2-3", rest: 150, unit: "reps" },
    // Con descripcion a proposito: la ficha de "mas informacion" solo aparece
    // si el ejercicio tiene una, y sin eso no hay que probar el boton atras.
    { id: "e2", session: "A", order: 2, name: "Remo con barra", group: "Espalda", sets: 3, refKg: 50, repsMin: 8, repsMax: 10, rir: "2-3", rest: 120, unit: "reps", description: "Agarre prono, tirar al ombligo. Espalda neutra, sin tiron lumbar." },
    // Con dropset a proposito: es lo que permite mirar la tecnica en un
    // navegador de verdad, que es donde aparecieron los ultimos bugs.
    { id: "e3", session: "A", order: 3, name: "Press militar", group: "Hombro", sets: 3, refKg: 32.5, repsMin: 8, repsMax: 10, rir: "2", rest: 120, unit: "reps", technique: { tipo: "dropset", pasos: 2, aplica: "ultima" } },
    // Con ISO-EST a proposito, y en la misma sesion que el dropset: son las dos
    // caras de "adentro de la serie" y el riesgo de cada una es el OPUESTO. El
    // dropset tiene que FRENAR el descanso hasta el ultimo escalon; la
    // isometrica no tiene escalones, asi que si se le cuela uno el descanso no
    // arranca NUNCA en ese ejercicio. Eso no se ve hasta estar en el gimnasio.
    { id: "e7", session: "A", order: 4, name: "Curl femoral sentado", group: "Isquios", sets: 3, refKg: 40, repsMin: 10, repsMax: 12, rir: "2", rest: 90, unit: "reps", technique: { tipo: "isoest", pasos: 0, aplica: "ultima" } },
    { id: "e4", session: "B", order: 1, name: "Sentadilla pendular", group: "Cuadriceps", sets: 3, refKg: 80, repsMin: 8, repsMax: 10, rir: "2-3", rest: 180, unit: "reps" },
    { id: "e5", session: "B", order: 2, name: "Hip thrust", group: "Gluteo", sets: 3, refKg: 90, repsMin: 8, repsMax: 12, rir: "2-3", rest: 150, unit: "reps" },
    { id: "e6", session: "C", order: 1, name: "Dominadas", group: "Espalda", sets: 3, refKg: "BW", repsMin: 5, repsMax: 8, rir: "1-2", rest: 180, unit: "reps" },
  ],
};
const remoto = {
  ...local,
  id: scope(coachUser.id, local.id),
  exercises: local.exercises.map((e) => ({ ...e, id: scope(coachUser.id, e.id) })),
};
await progs.saveProgram(coachUser.id, remoto);
await tr.asignarPrograma({
  programId: remoto.id, athleteId: ana.id,
  coachUserId: coachUser.id, coachId: coach.id,
});

/* ---------- Ana entrena ---------- */

const asignacion = await tr.asignacionDeMiAlumno({ athleteId: ana.id, coachUserId: coachUser.id });
const cycleId = await tr.ensureCycle({ assignmentId: asignacion.assignmentId, athleteId: ana.id });
const ex = (n) => scope(ana.id, remoto.exercises[n].id);
const nombre = (n) => remoto.exercises[n].name;

const serie = (n, setNumber, kg, reps, rir) => ({
  programExerciseId: ex(n), exerciseName: nombre(n), setNumber, kg, reps, rir,
});

// Semana 1
await tr.saveSession({
  cycleId, athleteId: ana.id, week: "1", sessionCode: "A", sessionName: "Torso",
  performedAt: hace(12), durationMin: 64, health: { sleep: 4, stress: 2, energy: 4 },
  note: "Primera sesión del ciclo. El press banca me quedó re liviano, terminé las tres series sin esfuerzo.",
  sets: [
    serie(0, 1, 60, 10, 4.5), serie(0, 2, 60, 10, 4.5), serie(0, 3, 60, 10, 5),
    serie(1, 1, 50, 10, 2.5), serie(1, 2, 50, 10, 2), serie(1, 3, 50, 9, 2),
    serie(2, 1, 32.5, 9, 2), serie(2, 2, 32.5, 8, 2),
  ],
});
await tr.saveSession({
  cycleId, athleteId: ana.id, week: "1", sessionCode: "B", sessionName: "Pierna",
  performedAt: hace(10), durationMin: 58, health: { sleep: 3, stress: 3, energy: 3 },
  sets: [
    serie(3, 1, 80, 10, 3), serie(3, 2, 80, 9, 2), serie(3, 3, 80, 8, 2),
    serie(4, 1, 90, 12, 3), serie(4, 2, 90, 11, 2),
  ],
});

// Semana 2 — sube el press, aparece molestia en el hombro
await tr.saveSession({
  cycleId, athleteId: ana.id, week: "2", sessionCode: "A", sessionName: "Torso",
  performedAt: hace(5), durationMin: 61, health: { sleep: 4, stress: 2, energy: 4 },
  note: "Subí el press a 67.5 como me dijiste, mucho mejor. En el militar sentí una molestia en el hombro derecho al bajar, no fuerte pero está.",
  sets: [
    serie(0, 1, 67.5, 10, 2.5), serie(0, 2, 67.5, 9, 2), serie(0, 3, 67.5, 9, 2),
    serie(1, 1, 52.5, 10, 2), serie(1, 2, 52.5, 10, 2), serie(1, 3, 52.5, 9, 2),
    // Militar con objetivo RIR 2 y reportando 0: le esta quedando pesado.
    serie(2, 1, 35, 8, 0), serie(2, 2, 35, 7, 0), serie(2, 3, 35, 6, 0),
  ],
});
await tr.saveSession({
  cycleId, athleteId: ana.id, week: "2", sessionCode: "B", sessionName: "Pierna",
  performedAt: hace(3), durationMin: 55, health: { sleep: 4, stress: 2, energy: 5 },
  sets: [
    serie(3, 1, 85, 10, 2.5), serie(3, 2, 85, 9, 2), serie(3, 3, 85, 9, 2),
    serie(4, 1, 95, 12, 2.5), serie(4, 2, 95, 11, 2), serie(4, 3, 95, 10, 2),
  ],
});
await tr.saveSession({
  cycleId, athleteId: ana.id, week: "2", sessionCode: "C", sessionName: "Full body",
  performedAt: hace(1), durationMin: 47, health: { sleep: 3, stress: 4, energy: 3 },
  note: "Semana con mucho laburo, llegué cansada. Las dominadas salieron igual.",
  sets: [
    // Dominadas es `e6`, que en la lista es el indice 6 y no el 5: `serie(5)`
    // apuntaba a Hip thrust, asi que la unica sesion con un ejercicio a PESO
    // CORPORAL de toda la demo en realidad no lo tenia — y por eso ninguna
    // verificacion habia tocado nunca ese camino.
    //
    // La primera con LASTRE y las otras dos sin nada: en un ejercicio a peso
    // corporal el campo de kilos es el lastre, y hay que poder ver que se SUMA
    // al cuerpo en vez de reemplazarlo. Va adentro de esta sesion y no en una
    // nueva: agregar una completaba la semana 1 y la demo dejaba de tener una
    // semana a medias, que es lo que verifica el aviso de Progreso.
    serie(6, 1, 5, 6, 1), serie(6, 2, null, 6, 1), serie(6, 3, null, 5, 0),
  ],
});

/* ---------- cookies de sesion ---------- */

const secret = process.env.NEXTAUTH_SECRET;
let cookies = null;
if (secret) {
  const jwtMod = await import("next-auth/jwt");
  const encode = jwtMod.encode || jwtMod.default?.encode;
  cookies = {};
  for (const [clave, u] of [["coach", coachUser], ["ana", ana], ["beto", beto]]) {
    cookies[clave] = await encode({
      secret,
      maxAge: 30 * 24 * 60 * 60,
      token: { name: u.displayName, email: u.email, sub: u.id, uid: u.id, role: u.role || "athlete" },
    });
  }
}

console.log(JSON.stringify({
  db: url,
  coach: { id: coachUser.id, email: coachUser.email },
  ana: { id: ana.id, email: ana.email },
  beto: { id: beto.id, email: beto.email },
  programa: remoto.id,
  cookies,
}, null, 2));
