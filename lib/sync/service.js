/**
 * Logica de sincronizacion, sin HTTP ni sesion.
 *
 * El route handler solo resuelve la autenticacion y delega aca. Separado a
 * proposito: asi `verify-sync.mjs` ejercita el codigo REAL contra una base
 * descartable, en vez de una copia que puede divergir.
 */
import { saveProgram, getProgram, listByOwner, softDeleteProgram } from "../repo/programs.js";
import {
  ensureAssignment, ensureCycle, saveSession, listHistory, listSets,
  programasAsignados, resolveRefs, asignacionesDeMisProgramas,
} from "../repo/training.js";
import { listCatalog, saveCatalog } from "../repo/catalog.js";
import { entrenadorDe } from "../repo/coaching.js";
import { findById } from "../repo/users.js";
import { avisarNota } from "../coach/nota-email.js";
import { scope, unscope, scopeProgram, unscopeProgram, scopeCatalog, unscopeCatalog } from "./ids.js";

/**
 * Sube un programa sin sesion asociada.
 *
 * Hasta ahora un programa solo llegaba al servidor cuando se terminaba una
 * sesion con el, asi que uno recien creado no existia del otro lado — y por lo
 * tanto no se podia asignar a un alumno. Crear un programa y prescribirlo sin
 * haberlo entrenado antes es exactamente lo que hace un entrenador.
 */
/**
 * Sube el catalogo del usuario.
 *
 * Va aparte de los programas porque un ejercicio puede existir sin estar en
 * ninguno: alguien lo carga hoy y lo usa la semana que viene. Antes eso era lo
 * unico que no sobrevivia al cambio de dispositivo.
 */
export async function pushCatalogForUser(userId, catalog) {
  if (!catalog?.length) return { ok: true, guardados: 0 };
  const guardados = await saveCatalog(userId, scopeCatalog(userId, catalog));
  return { ok: true, guardados };
}

/**
 * Programas que el usuario borro en algun dispositivo.
 *
 * El borrado necesita viajar explicitamente: el pull manda lo que EXISTE, y de
 * una lista de programas no se puede deducir cual falta porque lo borraron y
 * cual falta porque el otro dispositivo todavia no lo subio. Sin esto, borrar un
 * programa en el celular y sincronizar desde la compu lo resucitaba.
 *
 * Es borrado suave: la fila queda, con su historial colgando.
 */
export async function borrarProgramasDe(userId, ids = []) {
  let borrados = 0;
  for (const local of ids) {
    if (await softDeleteProgram(scope(userId, local), userId)) borrados++;
  }
  return borrados;
}

export async function pushProgramForUser(userId, program) {
  if (program?.readOnly) return { ok: false, motivo: "ajeno" };
  const remoto = scopeProgram(userId, program);
  await saveProgram(userId, remoto);
  return { ok: true, id: remoto.id };
}

export async function pushForUser(userId, { program, entry }) {
  const remoto = scopeProgram(userId, program);

  // Un programa asignado por un entrenador NO se reescribe desde el alumno: la
  // prescripcion es del coach. `scopeProgram` ya devolvio los ids intactos
  // porque vienen prefijados, asi que las series apuntan a SUS ejercicios.
  if (!program.readOnly) {
    // El programa va primero: los set_logs referencian program_exercises, asi
    // que tiene que existir antes de guardar la sesion.
    await saveProgram(userId, remoto);
  }

  const assignmentId = await ensureAssignment({ programId: remoto.id, athleteId: userId });
  const cycleId = await ensureCycle({ assignmentId, athleteId: userId });

  // El cliente manda las series anidadas por ejercicio; la base las guarda planas.
  const sets = [];
  for (const ex of entry.exercises || []) {
    for (const s of ex.sets || []) {
      sets.push({
        programExerciseId: scope(userId, ex.id),
        exerciseName: ex.name,
        setNumber: s.setN,
        kg: s.kg,
        reps: s.reps,
        rir: s.rir,
        // Los escalones de un dropset viajan con la serie: son parte de ELLA,
        // no series aparte. Sin esto la tecnica se registraba en el telefono y
        // se perdia al subir.
        pasos: s.pasos,
      });
    }
  }

  await saveSession({
    cycleId,
    athleteId: userId,
    week: entry.week,
    sessionCode: entry.session,
    sessionName: entry.sessionName,
    performedAt: new Date(entry.date || Date.now()).toISOString(),
    durationMin: entry.duration ?? null,
    health: entry.health,
    // Feedback del alumno hacia su entrenador. Viaja con la sesion y no aparte:
    // una nota sin la sesion que la origino no se entiende.
    note: entry.note ?? null,
    sets,
  });

  // El aviso al entrenador va DESPUES de guardar y sin bloquear: la sesion ya
  // esta a salvo, y que Resend tarde o falle no puede demorar la respuesta al
  // telefono de alguien que acaba de terminar de entrenar.
  if (String(entry.note ?? "").trim()) {
    avisarDeLaNota(userId, entry).catch(() => {});
  }

  return { cycleId, sets: sets.length };
}

/**
 * Le avisa al entrenador —si lo hay— que su alumno dejo una nota.
 *
 * Silencioso a proposito en todos sus caminos: sin entrenador no hay a quien
 * avisarle, sin `RESEND_API_KEY` no hay como, y un mail que no sale no puede
 * hacer fallar una sesion que ya se guardo.
 */
async function avisarDeLaNota(userId, entry) {
  const coach = await entrenadorDe(userId);
  if (!coach?.email) return;
  const alumno = await findById(userId);
  await avisarNota({
    para: coach.email,
    alumno: alumno?.displayName || alumno?.email || "Tu alumno",
    nota: entry.note,
    sesion: entry.sessionName || entry.session,
    semana: entry.week,
  });
}

/** Todo lo del usuario, con los ids que conoce su cliente. */
export async function pullForUser(userId) {
  // A quien le asigno cada programa propio. Sirve para que el entrenador
  // distinga los que entrena el de los que prescribe, y para avisarle que
  // editar uno prescrito le cambia la rutina a otra persona.
  const asignadosPorMi = await asignacionesDeMisProgramas(userId);

  const resumen = await listByOwner(userId);
  const programs = [];
  for (const p of resumen) {
    const completo = await getProgram(p.id);
    if (!completo) continue;
    const alumnos = asignadosPorMi[p.id] || [];
    programs.push({
      ...unscopeProgram(userId, completo),
      ...(alumnos.length ? { asignadoA: alumnos } : {}),
    });
  }

  // Programas que le asigno un entrenador. Van con sus ids REMOTOS sin tocar:
  // son del coach y los dos lados tienen que referirse al mismo ejercicio.
  // `readOnly` es lo que impide que el alumno edite la prescripcion.
  for (const asig of await programasAsignados(userId)) {
    const completo = await getProgram(asig.programId);
    if (!completo) continue;

    // Las referencias de kilos son POR ATLETA: dos alumnos con el mismo
    // programa entrenan con cargas distintas. Se aplican sobre la plantilla
    // antes de mandarla, asi el cliente no necesita saber que existen.
    const refs = await resolveRefs(asig.assignmentId, "*");
    const exercises = completo.exercises.map((e) => {
      const propia = refs[e.id];
      if (!propia) return e;
      return {
        ...e,
        refKg: propia.refKg === null || propia.refKg === undefined ? e.refKg : propia.refKg,
        sets: propia.sets ?? e.sets,
      };
    });

    programs.push({
      ...completo,
      exercises,
      readOnly: true,
      assignmentId: asig.assignmentId,
      coachName: asig.coachOwner || asig.coachName || "Tu entrenador",
    });
  }

  const sesiones = await listHistory(userId);
  const history = [];
  for (const s of sesiones) {
    const sets = await listSets(s.cycleId, s.week, s.session);

    // Se reagrupan por ejercicio para devolver la forma que espera la app.
    const porEjercicio = new Map();
    for (const set of sets) {
      const id = unscope(userId, set.exerciseId) || set.exerciseName;
      if (!porEjercicio.has(id)) {
        porEjercicio.set(id, { id, name: set.exerciseName, group: null, sets: [] });
      }
      porEjercicio.get(id).sets.push({
        setN: set.setNumber,
        kg: set.kg,
        reps: set.reps,
        rir: set.rir,
        pasos: set.pasos?.length ? set.pasos : undefined,
      });
    }

    history.push({
      id: s.id,
      programId: unscope(userId, s.programId),
      week: s.week,
      session: s.session,
      sessionName: s.sessionName,
      date: new Date(s.date).getTime(),
      duration: s.duration,
      health: s.health,
      note: s.note || null,
      exercises: [...porEjercicio.values()],
    });
  }

  // El catalogo va entero: el base compartido mas lo que cargo el usuario. Es
  // lo que permite que un ejercicio creado en el celular aparezca en el
  // selector de la compu, y no solo dentro del programa que lo usa.
  const catalog = unscopeCatalog(userId, await listCatalog(userId));

  return { programs, history, catalog };
}
