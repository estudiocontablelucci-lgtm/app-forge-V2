/**
 * Logica de sincronizacion, sin HTTP ni sesion.
 *
 * El route handler solo resuelve la autenticacion y delega aca. Separado a
 * proposito: asi `verify-sync.mjs` ejercita el codigo REAL contra una base
 * descartable, en vez de una copia que puede divergir.
 */
import { saveProgram, getProgram, listByOwner } from "../repo/programs.js";
import { ensureAssignment, ensureCycle, saveSession, listHistory, listSets } from "../repo/training.js";
import { scope, unscope, scopeProgram, unscopeProgram } from "./ids.js";

/** Sube una sesion terminada junto con el programa al que pertenece. */
export async function pushForUser(userId, { program, entry }) {
  // El programa va primero: los set_logs referencian program_exercises, asi que
  // tiene que existir antes de guardar la sesion.
  const remoto = scopeProgram(userId, program);
  await saveProgram(userId, remoto);

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
    sets,
  });

  return { cycleId, sets: sets.length };
}

/** Todo lo del usuario, con los ids que conoce su cliente. */
export async function pullForUser(userId) {
  const resumen = await listByOwner(userId);
  const programs = [];
  for (const p of resumen) {
    const completo = await getProgram(p.id);
    if (completo) programs.push(unscopeProgram(userId, completo));
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
      exercises: [...porEjercicio.values()],
    });
  }

  return { programs, history };
}
