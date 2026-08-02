/**
 * Verifica el vinculo entrenador–alumno sobre una base descartable.
 *
 *   node scripts/verify-coaching.mjs
 *
 * Cubre las reglas de producto que se decidieron explicitamente: no hay
 * espacios de entrenador vacios, el cupo se topea, y dar de baja libera el cupo
 * sin borrar el historial del alumno.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-coaching.db");
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

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

const entrenador = await users.findOrCreate({ email: "coach@example.com", displayName: "Entrenador" });
const ana = await users.findOrCreate({ email: "ana@example.com", displayName: "Ana" });
const beto = await users.findOrCreate({ email: "beto@example.com", displayName: "Beto" });

let invitacionAna = null;

await check("no hay espacio de entrenador hasta la primera invitacion", async () => {
  if (await co.getCoachDe(entrenador.id)) return "existe un coach sin haber invitado a nadie";
  return true;
});

await check("invitar crea el espacio y deja al usuario como 'both'", async () => {
  const r = await co.invitar({ ownerUserId: entrenador.id, email: "Ana@Example.com ", nombreCoach: "Estudio" });
  if (!r.ok) return `no invito: ${r.motivo}`;
  invitacionAna = r;
  const coach = await co.getCoachDe(entrenador.id);
  if (!coach) return "no creo el espacio";
  const u = await users.findById(entrenador.id);
  if (u.role !== "both") return `rol quedo en ${u.role}, esperaba 'both'`;
  if (r.email !== "ana@example.com") return `email sin normalizar: ${r.email}`;
  return true;
});

await check("no se puede invitar dos veces al mismo email", async () => {
  const r = await co.invitar({ ownerUserId: entrenador.id, email: "ana@example.com" });
  if (r.ok) return "permitio una segunda invitacion viva";
  if (r.motivo !== "ya-invitado") return `motivo ${r.motivo}`;
  return true;
});

await check("un email invalido se rechaza sin crear nada", async () => {
  const r = await co.invitar({ ownerUserId: entrenador.id, email: "no-es-un-email" });
  if (r.ok) return "acepto un email invalido";
  return true;
});

await check("la invitacion aparece para el email invitado", async () => {
  const lista = await co.invitacionesPara("ana@example.com");
  if (lista.length !== 1) return `${lista.length} invitaciones, esperaba 1`;
  if (lista[0].coachName !== "Estudio") return `nombre del coach: ${lista[0].coachName}`;
  const otras = await co.invitacionesPara("beto@example.com");
  if (otras.length !== 0) return "Beto ve invitaciones ajenas";
  return true;
});

await check("aceptar crea el vinculo y registra el consentimiento", async () => {
  const r = await co.aceptarInvitacion({ token: invitacionAna.token, userId: ana.id, email: ana.email });
  if (!r.ok) return `no acepto: ${r.motivo}`;

  const alumnos = await co.listarAlumnos(invitacionAna.coachId);
  if (alumnos.length !== 1 || alumnos[0].id !== ana.id) return "Ana no quedo como alumna";

  const consent = await db.execute({
    sql: "SELECT scope, revoked_at FROM health_consents WHERE user_id = ? AND granted_to = ?",
    args: [ana.id, invitacionAna.coachId],
  });
  if (consent.rows.length !== 1) return "no registro el consentimiento";
  if (consent.rows[0].revoked_at) return "el consentimiento nacio revocado";
  return true;
});

await check("una invitacion usada no se puede reusar", async () => {
  const r = await co.aceptarInvitacion({ token: invitacionAna.token, userId: beto.id, email: beto.email });
  if (r.ok) return "acepto dos veces la misma invitacion";
  if (r.motivo !== "ya-usada") return `motivo ${r.motivo}`;
  return true;
});

await check("el link no sirve para otro email", async () => {
  const r = await co.invitar({ ownerUserId: entrenador.id, email: "beto@example.com" });
  const intruso = await users.findOrCreate({ email: "intruso@example.com", displayName: "Intruso" });
  const res = await co.aceptarInvitacion({ token: r.token, userId: intruso.id, email: intruso.email });
  if (res.ok) return "un tercero acepto una invitacion ajena";
  if (res.motivo !== "otro-email") return `motivo ${res.motivo}`;
  // Se deja aceptada por Beto para el resto de los checks.
  await co.aceptarInvitacion({ token: r.token, userId: beto.id, email: beto.email });
  return true;
});

await check("el cupo se topea contando activos e invitados", async () => {
  const coach = await co.getCoachDe(entrenador.id);
  if (coach.maxAthletes !== 3) return `max_athletes es ${coach.maxAthletes}, esperaba 3`;
  const usados = await co.contarAlumnos(coach.id);
  if (usados !== 2) return `${usados} ocupados, esperaba 2 (Ana y Beto)`;

  const tercero = await co.invitar({ ownerUserId: entrenador.id, email: "tercero@example.com" });
  if (!tercero.ok) return `no dejo invitar al tercero: ${tercero.motivo}`;

  // Ese tercero todavia no acepto, pero ya ocupa cupo: si no, se podrian
  // mandar invitaciones sin limite y superar el tope al aceptarse todas.
  const cuarto = await co.invitar({ ownerUserId: entrenador.id, email: "cuarto@example.com" });
  if (cuarto.ok) return "dejo pasar el cupo de 3";
  if (cuarto.motivo !== "cupo-lleno") return `motivo ${cuarto.motivo}`;
  return true;
});

await check("dar de baja libera el cupo y revoca el consentimiento", async () => {
  const coach = await co.getCoachDe(entrenador.id);
  const antes = await co.contarAlumnos(coach.id);
  await co.darDeBaja({ coachId: coach.id, athleteId: beto.id });
  const despues = await co.contarAlumnos(coach.id);
  if (despues !== antes - 1) return `el cupo paso de ${antes} a ${despues}`;

  const consent = await db.execute({
    sql: "SELECT revoked_at FROM health_consents WHERE user_id = ? AND granted_to = ?",
    args: [beto.id, coach.id],
  });
  if (!consent.rows[0]?.revoked_at) return "el consentimiento sigue vigente";
  return true;
});

await check("dar de baja NO borra al alumno ni su historial", async () => {
  // Los entrenamientos son del alumno: la baja corta el vinculo, no los datos.
  const u = await users.findById(beto.id);
  if (!u) return "se borro el usuario";
  const vinculo = await db.execute({
    sql: "SELECT status FROM coach_athletes WHERE athlete_id = ?",
    args: [beto.id],
  });
  if (!vinculo.rows.length) return "se borro el vinculo en vez de archivarlo";
  if (vinculo.rows[0].status !== "ended") return `status ${vinculo.rows[0].status}`;
  return true;
});

await check("el entrenador deja de poder ver al alumno dado de baja", async () => {
  const coach = await co.getCoachDe(entrenador.id);
  if (await co.puedeVer({ coachId: coach.id, athleteId: beto.id })) return "sigue viendo a Beto";
  if (!(await co.puedeVer({ coachId: coach.id, athleteId: ana.id }))) return "dejo de ver a Ana";
  return true;
});

await check("un alumno que vuelve reactiva el vinculo con su historial", async () => {
  const coach = await co.getCoachDe(entrenador.id);
  const r = await co.invitar({ ownerUserId: entrenador.id, email: beto.email });
  if (!r.ok) return `no dejo reinvitar: ${r.motivo}`;
  const acc = await co.aceptarInvitacion({ token: r.token, userId: beto.id, email: beto.email });
  if (!acc.ok) return `no acepto: ${acc.motivo}`;

  const filas = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM coach_athletes WHERE coach_id = ? AND athlete_id = ?",
    args: [coach.id, beto.id],
  });
  if (Number(filas.rows[0].n) !== 1) return `${filas.rows[0].n} vinculos, esperaba 1 reactivado`;
  if (!(await co.puedeVer({ coachId: coach.id, athleteId: beto.id }))) return "no lo volvio a ver";
  return true;
});

await check("un entrenador no ve alumnos de otro", async () => {
  const otra = await users.findOrCreate({ email: "otracoach@example.com", displayName: "Otra" });
  const r = await co.invitar({ ownerUserId: otra.id, email: "propio@example.com" });
  const suCoach = await co.getCoachDe(otra.id);
  const mios = await co.listarAlumnos((await co.getCoachDe(entrenador.id)).id);
  const suyos = await co.listarAlumnos(suCoach.id);
  if (suyos.length !== 0) return "la otra entrenadora ya ve alumnos sin que nadie acepte";
  if (!mios.some((a) => a.id === ana.id)) return "se perdieron los alumnos propios";
  if (!r.ok) return "no pudo invitar";
  return true;
});

/* ---------- asignar programas ---------- */

const { pushForUser, pullForUser } = await import("../lib/sync/service.js");
const { asignarPrograma, setRef, ensureAssignment } = await import("../lib/repo/training.js");
const { scope } = await import("../lib/sync/ids.js");

const PROGRAMA_COACH = {
  id: "prog-fuerza", name: "Fuerza base", weeks: 4, hasDeload: true,
  sessions: [{ id: "A", name: "Full A" }],
  exercises: [
    { id: "e1", session: "A", order: 1, name: "Press banca", group: "Pecho", sets: 3, refKg: 60, repsMin: 8, repsMax: 10, unit: "reps" },
    { id: "e2", session: "A", order: 2, name: "Remo", group: "Espalda", sets: 3, refKg: 50, repsMin: 8, repsMax: 10, unit: "reps" },
  ],
};

let idRemotoPrograma = null;
let asignacionAna = null;

await check("el entrenador sube su programa y se lo asigna al alumno", async () => {
  await pushForUser(entrenador.id, {
    program: PROGRAMA_COACH,
    entry: { week: 1, session: "A", sessionName: "Full A", date: Date.now(), exercises: [] },
  });
  idRemotoPrograma = scope(entrenador.id, "prog-fuerza");

  const coach = await co.getCoachDe(entrenador.id);
  const r = await asignarPrograma({
    programId: idRemotoPrograma, athleteId: ana.id,
    coachUserId: entrenador.id, coachId: coach.id,
  });
  if (!r.ok) return `no asigno: ${r.motivo}`;
  asignacionAna = r.assignmentId;
  return true;
});

await check("no se puede asignar un programa ajeno ni a un no-alumno", async () => {
  const coach = await co.getCoachDe(entrenador.id);
  const ajeno = await asignarPrograma({
    programId: scope(ana.id, "algo-de-ana"), athleteId: ana.id,
    coachUserId: entrenador.id, coachId: coach.id,
  });
  if (ajeno.ok) return "dejo asignar un programa que no es suyo";

  const extrano = await users.findOrCreate({ email: "extrano@example.com", displayName: "Extrano" });
  const r = await asignarPrograma({
    programId: idRemotoPrograma, athleteId: extrano.id,
    coachUserId: entrenador.id, coachId: coach.id,
  });
  if (r.ok) return "dejo asignarle un programa a alguien que no es su alumno";
  return true;
});

await check("el alumno recibe el programa asignado, en modo lectura", async () => {
  const { programs } = await pullForUser(ana.id);
  const asignado = programs.find((p) => p.readOnly);
  if (!asignado) return `no le llego (ve ${programs.length} programas)`;
  if (asignado.name !== "Fuerza base") return `nombre ${asignado.name}`;
  if (!asignado.coachName) return "no dice de quien es";
  if (asignado.exercises.length !== 2) return `${asignado.exercises.length} ejercicios`;
  return true;
});

await check("los ids del programa asignado NO se re-prefijan", async () => {
  // Sin esto el alumno generaria `ana~coach~e1` y sus series quedarian
  // colgando de un ejercicio distinto al que el entrenador prescribio.
  const { programs } = await pullForUser(ana.id);
  const asignado = programs.find((p) => p.readOnly);
  if (asignado.id !== idRemotoPrograma) return `id ${asignado.id}, esperaba ${idRemotoPrograma}`;

  const scoped = scope(ana.id, asignado.exercises[0].id);
  if (scoped !== asignado.exercises[0].id) return `scope lo volvio a prefijar: ${scoped}`;
  return true;
});

await check("cada alumno ve SUS kilos en el mismo programa", async () => {
  const coach = await co.getCoachDe(entrenador.id);
  await asignarPrograma({ programId: idRemotoPrograma, athleteId: beto.id, coachUserId: entrenador.id, coachId: coach.id });
  const asigBeto = await ensureAssignment({ programId: idRemotoPrograma, athleteId: beto.id });

  const idEjercicio = scope(entrenador.id, "e1");
  await setRef({ assignmentId: asignacionAna, programExerciseId: idEjercicio, refKg: 40 });
  await setRef({ assignmentId: asigBeto, programExerciseId: idEjercicio, refKg: 90 });

  const deAna = (await pullForUser(ana.id)).programs.find((p) => p.readOnly);
  const deBeto = (await pullForUser(beto.id)).programs.find((p) => p.readOnly);
  const refAna = deAna.exercises.find((e) => e.id === idEjercicio)?.refKg;
  const refBeto = deBeto.exercises.find((e) => e.id === idEjercicio)?.refKg;

  if (String(refAna) !== "40") return `Ana ve ${refAna}, esperaba 40`;
  if (String(refBeto) !== "90") return `Beto ve ${refBeto}, esperaba 90`;
  return true;
});

await check("el alumno entrena el programa asignado sin pisar la plantilla", async () => {
  const asignado = (await pullForUser(ana.id)).programs.find((p) => p.readOnly);
  await pushForUser(ana.id, {
    program: asignado,
    entry: {
      week: 1, session: "A", sessionName: "Full A", date: Date.now(),
      exercises: [{ id: asignado.exercises[0].id, name: "Press banca", sets: [{ setN: 1, kg: 40, reps: 10, rir: 2 }] }],
    },
  });

  // La plantilla del entrenador queda como estaba: su ref general sigue en 60,
  // aunque Ana entrene con 40.
  const delCoach = (await pullForUser(entrenador.id)).programs.find((p) => p.id === "prog-fuerza");
  if (!delCoach) return "el entrenador perdio su programa";
  if (String(delCoach.exercises.find((e) => e.id === "e1").refKg) !== "60") {
    return `la ref de la plantilla quedo en ${delCoach.exercises.find((e) => e.id === "e1").refKg}`;
  }

  // Y la serie de Ana quedo atada al ejercicio del entrenador.
  const hist = (await pullForUser(ana.id)).history;
  const sesion = hist.find((h) => h.session === "A");
  if (!sesion) return "no quedo registrada la sesion";
  if (sesion.exercises[0].sets[0].kg !== 40) return "no guardo los kilos de Ana";
  return true;
});

await check("el alumno no genera un programa duplicado al entrenar", async () => {
  const { programs } = await pullForUser(ana.id);
  const propios = programs.filter((p) => !p.readOnly);
  if (propios.length) return `aparecieron ${propios.length} programas propios que no creo`;
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  coaching: invitaciones, cupo, consentimiento y baja sin perdida de datos");
