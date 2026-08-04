/**
 * Ejecucion: asignacion de un programa a un atleta, referencias por atleta,
 * ciclos y logs de entrenamiento.
 *
 * El caso "atleta individual" no es un camino aparte: es una asignacion donde
 * `assigned_by` es el propio atleta y el programa no tiene coach_id.
 */
import { getDb, now, tx, uid } from "../db.js";
import { brzycki } from "../formulas.js";

/* ---------- escalones adentro de una serie (dropset y familia) ---------- */

/**
 * Los escalones de una serie, normalizados antes de guardarse.
 *
 * Se limpia lo vacio: un escalon sin reps es uno que el atleta no llego a
 * hacer, y guardarlo haria que la serie parezca tener un drop de cero reps.
 */
function pasosToDb(pasos) {
  if (!Array.isArray(pasos)) return null;
  const limpios = pasos
    .map((p) => ({
      kg: p?.kg === null || p?.kg === undefined || p?.kg === "" ? null : Number(p.kg),
      reps: p?.reps === null || p?.reps === undefined || p?.reps === "" ? null : parseInt(p.reps, 10),
    }))
    .filter((p) => p.reps);
  return limpios.length ? JSON.stringify(limpios) : null;
}

function pasosFromDb(v) {
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/* ---------- asignaciones y ciclos ---------- */

/** Asignacion activa del atleta para ese programa; la crea si no existe. */
export async function ensureAssignment({ programId, athleteId, assignedBy = null }) {
  const db = getDb();
  const found = await db.execute({
    sql: `SELECT id FROM assignments
          WHERE program_id = ? AND athlete_id = ? AND status = 'active' AND deleted_at IS NULL
          LIMIT 1`,
    args: [programId, athleteId],
  });
  if (found.rows[0]) return found.rows[0].id;

  const id = uid();
  const ts = now();
  await db.execute({
    sql: `INSERT INTO assignments (id, program_id, athlete_id, assigned_by, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    args: [id, programId, athleteId, assignedBy || athleteId, ts, ts],
  });
  return id;
}

/**
 * Asigna un programa del entrenador a un alumno.
 *
 * Distinta de `ensureAssignment` en que valida: el programa tiene que ser del
 * entrenador y el alumno tiene que ser suyo. Es la operacion que expone la API,
 * asi que no puede confiar en que la UI haya chequeado.
 */
export async function asignarPrograma({ programId, athleteId, coachUserId, coachId }) {
  const db = getDb();

  const p = await db.execute({
    sql: "SELECT id FROM programs WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    args: [programId, coachUserId],
  });
  if (!p.rows[0]) return { ok: false, motivo: "programa-ajeno" };

  const v = await db.execute({
    sql: "SELECT 1 FROM coach_athletes WHERE coach_id = ? AND athlete_id = ? AND status = 'active'",
    args: [coachId, athleteId],
  });
  if (!v.rows[0]) return { ok: false, motivo: "no-es-alumno" };

  const id = await ensureAssignment({ programId, athleteId, assignedBy: coachUserId });
  // El programa asignado queda marcado como del coach, para que el alumno lo
  // reciba en modo lectura y no como uno propio.
  await db.execute({
    sql: "UPDATE programs SET coach_id = ?, updated_at = ? WHERE id = ?",
    args: [coachId, now(), programId],
  });
  return { ok: true, assignmentId: id };
}

/** Programas que le asignaron al atleta, con el id de su asignacion. */
export async function programasAsignados(athleteId) {
  const r = await getDb().execute({
    sql: `SELECT a.id AS assignment_id, a.program_id, c.name AS coach_name, u.display_name AS coach_owner
          FROM assignments a
          JOIN programs p ON p.id = a.program_id AND p.deleted_at IS NULL
          LEFT JOIN coaches c ON c.id = p.coach_id
          LEFT JOIN users u   ON u.id = c.owner_user_id
          WHERE a.athlete_id = ? AND a.status = 'active' AND a.deleted_at IS NULL
            AND p.owner_user_id <> ?`,
    args: [athleteId, athleteId],
  });
  return r.rows.map((a) => ({
    assignmentId: a.assignment_id,
    programId: a.program_id,
    coachName: a.coach_name,
    coachOwner: a.coach_owner,
  }));
}

/**
 * La asignacion viva de un alumno con un programa DEL entrenador que pregunta.
 *
 * No alcanza con `programasAsignados`: eso devuelve todo lo que le asignaron al
 * alumno, venga de quien venga. Un entrenador ve el programa que el prescribio
 * y no lo que otro le puso, aunque los dos lo tengan como alumno.
 */
export async function asignacionDeMiAlumno({ athleteId, coachUserId }) {
  const r = await getDb().execute({
    sql: `SELECT a.id AS assignment_id, a.program_id
          FROM assignments a
          JOIN programs p ON p.id = a.program_id AND p.deleted_at IS NULL
          WHERE a.athlete_id = ? AND p.owner_user_id = ?
            AND a.status = 'active' AND a.deleted_at IS NULL
          ORDER BY a.created_at DESC LIMIT 1`,
    args: [athleteId, coachUserId],
  });
  const a = r.rows[0];
  return a ? { assignmentId: a.assignment_id, programId: a.program_id } : null;
}

/**
 * Para cada programa del usuario, a que OTRAS personas se lo asigno.
 *
 * Se excluye a si mismo: entrenar el propio programa tambien genera una
 * asignacion, y esa no lo convierte en un programa "para alumnos".
 */
export async function asignacionesDeMisProgramas(ownerUserId) {
  const r = await getDb().execute({
    sql: `SELECT a.program_id, u.display_name, u.id AS athlete_id
          FROM assignments a
          JOIN programs p ON p.id = a.program_id
          JOIN users u    ON u.id = a.athlete_id
          WHERE p.owner_user_id = ? AND a.athlete_id <> ?
            AND a.status = 'active' AND a.deleted_at IS NULL AND p.deleted_at IS NULL`,
    args: [ownerUserId, ownerUserId],
  });
  const out = {};
  for (const f of r.rows) {
    (out[f.program_id] ||= []).push({ id: f.athlete_id, name: f.display_name });
  }
  return out;
}

/** Ciclo abierto de esa asignacion; lo crea si no hay ninguno sin archivar. */
export async function ensureCycle({ assignmentId, athleteId, label = "C1" }) {
  const db = getDb();
  const found = await db.execute({
    sql: `SELECT id FROM cycles
          WHERE assignment_id = ? AND archived_at IS NULL AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
    args: [assignmentId],
  });
  if (found.rows[0]) return found.rows[0].id;

  const id = uid();
  const ts = now();
  await db.execute({
    sql: `INSERT INTO cycles (id, assignment_id, athlete_id, label, started_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, assignmentId, athleteId, label, ts, ts, ts],
  });
  return id;
}

/* ---------- referencias por atleta ---------- */

/**
 * Kilos que le corresponden a ESTE atleta, no los de la plantilla.
 *
 * Precedencia: ref de la semana pedida > ref general ('*') > lo que diga la
 * plantilla. Es lo que permite que un mismo programa asignado a diez alumnos
 * no les imponga los mismos kilos.
 *
 * Devuelve un mapa { [programExerciseId]: { refKg, sets } } solo con overrides;
 * lo que no esta en el mapa usa el valor de la plantilla.
 */
export async function resolveRefs(assignmentId, week = "*") {
  const r = await getDb().execute({
    sql: `SELECT program_exercise_id, week, ref_kg, sets
          FROM assignment_refs
          WHERE assignment_id = ? AND week IN (?, '*')`,
    args: [assignmentId, String(week)],
  });

  const out = {};
  for (const row of r.rows) {
    const prev = out[row.program_exercise_id];
    // La fila de la semana concreta pisa a la generica, sin importar el orden
    // en que las devuelva el motor.
    if (prev && prev._week !== "*") continue;
    out[row.program_exercise_id] = {
      _week: row.week,
      refKg: row.ref_kg,
      sets: row.sets,
    };
  }
  for (const k of Object.keys(out)) delete out[k]._week;
  return out;
}

export async function setRef({ assignmentId, programExerciseId, week = "*", refKg, sets = null }) {
  await getDb().execute({
    sql: `INSERT INTO assignment_refs (assignment_id, program_exercise_id, week, ref_kg, sets, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (assignment_id, program_exercise_id, week) DO UPDATE SET
            ref_kg = excluded.ref_kg, sets = excluded.sets, updated_at = excluded.updated_at`,
    args: [assignmentId, programExerciseId, String(week), refKg === null || refKg === undefined ? null : String(refKg), sets, now()],
  });
}

/* ---------- logs ---------- */

/**
 * Guarda una sesion completa: cabecera + series.
 *
 * Reemplaza: volver a registrar la misma semana x sesion pisa lo anterior, que
 * es exactamente el re-entry flow de la app. Por eso los sets viejos de esa
 * combinacion se borran antes de insertar los nuevos — si no, una sesion
 * reeditada con menos series dejaria huerfanas las que sobran.
 */
export async function saveSession({
  cycleId, athleteId, week, sessionCode, sessionName,
  performedAt, durationMin, health, sets = [], note = null,
}) {
  const ts = now();
  const stmts = [];

  stmts.push({
    sql: `INSERT INTO session_logs
            (id, cycle_id, athlete_id, week, session_code, session_name, performed_at,
             duration_min, health_sleep, health_stress, health_energy, note, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (cycle_id, week, session_code) DO UPDATE SET
            session_name = excluded.session_name, performed_at = excluded.performed_at,
            duration_min = excluded.duration_min, health_sleep = excluded.health_sleep,
            health_stress = excluded.health_stress, health_energy = excluded.health_energy,
            note = excluded.note, updated_at = excluded.updated_at, deleted_at = NULL`,
    args: [
      uid(), cycleId, athleteId, String(week), sessionCode, sessionName || null,
      performedAt || ts, durationMin ?? null,
      health?.sleep ?? null, health?.stress ?? null, health?.energy ?? null, note, ts,
    ],
  });

  stmts.push({
    sql: "DELETE FROM set_logs WHERE cycle_id = ? AND week = ? AND session_code = ?",
    args: [cycleId, String(week), sessionCode],
  });

  for (const s of sets) {
    const kg = s.kg === null || s.kg === undefined || s.kg === "" ? null : Number(s.kg);
    const reps = s.reps === null || s.reps === undefined || s.reps === "" ? null : parseInt(s.reps, 10);
    const e1rm = kg !== null && reps ? brzycki(kg, reps) : null;
    stmts.push({
      sql: `INSERT INTO set_logs
              (id, cycle_id, athlete_id, program_exercise_id, exercise_name, week, session_code,
               set_number, kg, reps, rir, e1rm, steps_json, logged_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uid(), cycleId, athleteId, s.programExerciseId ?? null, s.exerciseName,
        String(week), sessionCode, s.setNumber, kg, reps,
        s.rir === null || s.rir === undefined || s.rir === "" ? null : Number(s.rir),
        e1rm, pasosToDb(s.pasos), s.loggedAt || ts, ts,
      ],
    });
  }

  await tx(stmts);
}

/**
 * Historial de sesiones del atleta, mas reciente primero.
 *
 * Trae `programId` por JOIN (session_log -> cycle -> assignment): la sesion no
 * lo guarda, pero el cliente filtra el historial por programa activo y sin eso
 * no puede separar dos ciclos distintos.
 */
export async function listHistory(athleteId, { cycleId = null, limit = 200 } = {}) {
  const r = await getDb().execute({
    sql: `SELECT sl.*, a.program_id
          FROM session_logs sl
          JOIN cycles c      ON c.id = sl.cycle_id
          JOIN assignments a ON a.id = c.assignment_id
          WHERE sl.athlete_id = ? AND sl.deleted_at IS NULL
            ${cycleId ? "AND sl.cycle_id = ?" : ""}
          ORDER BY sl.performed_at DESC
          LIMIT ?`,
    args: cycleId ? [athleteId, cycleId, limit] : [athleteId, limit],
  });
  return r.rows.map((s) => ({
    id: s.id,
    cycleId: s.cycle_id,
    programId: s.program_id,
    week: s.week,
    session: s.session_code,
    sessionName: s.session_name,
    date: s.performed_at,
    duration: s.duration_min,
    note: s.note || null,
    health: s.health_sleep === null && s.health_stress === null && s.health_energy === null
      ? null
      : { sleep: s.health_sleep, stress: s.health_stress, energy: s.health_energy },
  }));
}

/**
 * Todo lo entrenado bajo una asignacion: cabeceras de sesion y series planas.
 *
 * Es la lectura de la ficha del entrenador, y va por asignacion y no por atleta
 * a proposito: al entrenador le corresponde ver lo que hizo con EL programa que
 * el prescribio, no todo lo que la persona entrena por su cuenta.
 */
export async function loQueEntreno(assignmentId) {
  const db = getDb();
  const [ses, sets] = await Promise.all([
    db.execute({
      sql: `SELECT sl.* FROM session_logs sl
            JOIN cycles c ON c.id = sl.cycle_id
            WHERE c.assignment_id = ? AND sl.deleted_at IS NULL AND c.deleted_at IS NULL
            ORDER BY sl.performed_at DESC`,
      args: [assignmentId],
    }),
    db.execute({
      sql: `SELECT s.* FROM set_logs s
            JOIN cycles c ON c.id = s.cycle_id
            WHERE c.assignment_id = ? AND s.deleted_at IS NULL AND c.deleted_at IS NULL`,
      args: [assignmentId],
    }),
  ]);

  return {
    sesiones: ses.rows.map((s) => ({
      id: s.id,
      week: s.week,
      session: s.session_code,
      sessionName: s.session_name,
      date: s.performed_at,
      duration: s.duration_min,
      note: s.note || null,
      health: s.health_sleep === null && s.health_stress === null && s.health_energy === null
        ? null
        : { sleep: s.health_sleep, stress: s.health_stress, energy: s.health_energy },
    })),
    sets: sets.rows.map((s) => ({
      programExerciseId: s.program_exercise_id,
      exerciseName: s.exercise_name,
      week: s.week,
      session: s.session_code,
      setNumber: s.set_number,
      kg: s.kg,
      reps: s.reps,
      rir: s.rir,
      e1rm: s.e1rm,
      pasos: pasosFromDb(s.steps_json),
    })),
  };
}

/**
 * Ejercicios del programa que YA tienen series registradas, por quien sea.
 *
 * Es lo que decide si cambiar el ejercicio de una fila es corregir un nombre o
 * sustituir la maquina. Si hay series hechas, encadenar el e1RM de las dos seria
 * mezclar dos cosas distintas — es contra lo que advierte el programa real
 * ("su e1RM arranca como serie nueva, no continua la del belt squat").
 *
 * Mira las series de TODOS los atletas del programa: al entrenador le alcanza
 * con que uno solo lo haya entrenado para que la sustitucion importe.
 */
export async function ejerciciosConSeries(programId) {
  const r = await getDb().execute({
    sql: `SELECT DISTINCT s.program_exercise_id AS id
          FROM set_logs s
          JOIN program_exercises pe ON pe.id = s.program_exercise_id
          WHERE pe.program_id = ? AND s.deleted_at IS NULL AND s.program_exercise_id IS NOT NULL`,
    args: [programId],
  });
  return new Set(r.rows.map((x) => x.id));
}

/** Series de una sesion concreta, para expandir el detalle en el historial. */
export async function listSets(cycleId, week, sessionCode) {
  const r = await getDb().execute({
    sql: `SELECT * FROM set_logs
          WHERE cycle_id = ? AND week = ? AND session_code = ? AND deleted_at IS NULL
          ORDER BY exercise_name, set_number`,
    args: [cycleId, String(week), sessionCode],
  });
  return r.rows.map((s) => ({
    exerciseId: s.program_exercise_id,
    exerciseName: s.exercise_name,
    setNumber: s.set_number,
    kg: s.kg,
    reps: s.reps,
    rir: s.rir,
    e1rm: s.e1rm,
    pasos: pasosFromDb(s.steps_json),
  }));
}
