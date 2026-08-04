/**
 * Programas: plantilla completa (programa + sesiones + ejercicios).
 *
 * Traduce entre la forma que usa la UI (la misma que hoy vive en localStorage)
 * y las tres tablas del schema. La UI no conoce el schema y el schema no conoce
 * los nombres de la UI — el mapeo vive aca y en ningun otro lado.
 */
import { getDb, now, tx, uid } from "../db.js";
import { tecnicaFromDb, tecnicaToDb } from "../tecnicas.js";

/**
 * A ISO-8601, que es como el schema guarda todos los timestamps.
 *
 * El cliente maneja milisegundos (`Date.now()`) y el servidor strings ISO. Sin
 * normalizar, comparar "cual es mas nuevo" compara un numero con un texto y
 * siempre gana el mismo — que es no comparar nada.
 */
function aIso(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return new Date(v).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/* ---------- mapeo UI <-> schema ---------- */

// ref_kg es TEXT en el schema porque admite "BW" ademas de un numero.
function refToDb(v) {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}
function refFromDb(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v === "BW") return "BW";
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function exToUi(row) {
  return {
    id: row.id,
    // Referencia al catalogo. La columna existia desde la v03 y no la leia
    // nadie: el nombre volvia denormalizado y el ejercicio perdia su identidad
    // al pasar por el servidor.
    exerciseId: row.exercise_id,
    session: row.session_code,
    order: row.order_idx,
    name: row.name,
    group: row.muscle_group,
    sets: row.sets,
    refKg: refFromDb(row.ref_kg),
    repsMin: row.reps_min,
    repsMax: row.reps_max,
    tempo: row.tempo,
    rest: row.rest_sec,
    rir: row.rir_target,
    superset: row.superset_with,
    unit: row.rep_unit,
    // La UI trabaja con un objeto; la columna guarda JSON. Traducir aca es lo
    // mismo que se hace con `ref_kg`: el schema no conoce la forma de la UI.
    technique: tecnicaFromDb(row.technique),
    description: row.description || "",
  };
}

function programToUi(p, sessions, exercises) {
  return {
    id: p.id,
    name: p.name,
    weeks: p.weeks,
    hasDeload: p.has_deload === 1,
    status: p.status,
    version: p.version,
    createdAt: p.created_at,
    // Cuando el USUARIO lo edito, no cuando se subio. Es lo que permite decidir
    // quien gana entre dos dispositivos sin que el orden de sincronizacion
    // decida por nosotros.
    updatedAt: p.updated_at,
    // `coach_id` ya significaba "este programa pertenece al espacio de
    // entrenador": lo ponia `asignarPrograma`. Marcarlo a mano es decir lo mismo
    // antes de tener a quien asignarselo, asi que no hace falta una columna
    // nueva. Para el atleta no cambia nada: lo que lo vuelve de solo lectura es
    // tener una asignacion, no este campo.
    paraAlumnos: Boolean(p.coach_id),
    sessions: sessions.map((s) => ({ id: s.code, name: s.name })),
    exercises: exercises.map(exToUi),
  };
}

/* ---------- lectura ---------- */

export async function getProgram(programId) {
  const db = getDb();
  const [p, s, e] = await db.batch(
    [
      { sql: "SELECT * FROM programs WHERE id = ? AND deleted_at IS NULL", args: [programId] },
      { sql: "SELECT * FROM program_sessions WHERE program_id = ? ORDER BY order_idx", args: [programId] },
      {
        sql: `SELECT * FROM program_exercises
              WHERE program_id = ? AND deleted_at IS NULL
              ORDER BY session_code, order_idx`,
        args: [programId],
      },
    ],
    "read",
  );
  if (!p.rows[0]) return null;
  return programToUi(p.rows[0], s.rows, e.rows);
}

/** true si el programa existe y es de ese usuario. Guarda de toda escritura. */
export async function esDelUsuario(programId, ownerUserId) {
  const r = await getDb().execute({
    sql: "SELECT 1 FROM programs WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    args: [programId, ownerUserId],
  });
  return r.rows.length > 0;
}

/** Lista liviana: no trae ejercicios, es para el selector de programas. */
export async function listByOwner(userId) {
  const r = await getDb().execute({
    sql: `SELECT id, name, weeks, has_deload, status, coach_id, created_at, updated_at
          FROM programs
          WHERE owner_user_id = ? AND deleted_at IS NULL
          ORDER BY created_at DESC`,
    args: [userId],
  });
  return r.rows.map((p) => ({
    id: p.id,
    name: p.name,
    weeks: p.weeks,
    hasDeload: p.has_deload === 1,
    status: p.status,
    paraAlumnos: Boolean(p.coach_id),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

/**
 * Marca (o desmarca) un programa como "para alumnos".
 *
 * Es la clasificacion que faltaba: un programa que el entrenador escribe PARA
 * otro no se distingue de los suyos hasta que se lo asigna a alguien, asi que
 * los dos primeros dias vive mezclado con su propia rutina.
 *
 * Desmarcar no toca las asignaciones vivas: si alguien lo esta entrenando, el
 * programa es de alumnos aunque el entrenador diga lo contrario.
 */
export async function marcarParaAlumnos({ programId, ownerUserId, coachId, para }) {
  const db = getDb();

  if (!para) {
    const asignado = await db.execute({
      sql: `SELECT 1 FROM assignments a
            WHERE a.program_id = ? AND a.athlete_id <> ? AND a.status = 'active' AND a.deleted_at IS NULL
            LIMIT 1`,
      args: [programId, ownerUserId],
    });
    if (asignado.rows[0]) return { ok: false, motivo: "esta-asignado" };
  }

  const r = await db.execute({
    sql: `UPDATE programs SET coach_id = ?, updated_at = ?
          WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
    args: [para ? coachId : null, now(), programId, ownerUserId],
  });
  return r.rowsAffected > 0 ? { ok: true } : { ok: false, motivo: "programa-ajeno" };
}

/* ---------- escritura ---------- */

/**
 * Guarda el programa entero (crea o reemplaza sesiones y ejercicios).
 *
 * Dos detalles que no son opcionales:
 *
 * 1. `superset_with` es una FK a la propia tabla, asi que los ejercicios se
 *    insertan primero con NULL y se vinculan en una segunda pasada. Si no,
 *    el primero de una superserie referencia a uno que todavia no existe.
 *
 * 2. Los ejercicios que desaparecieron se borran con DELETE duro, no con
 *    soft delete: `UNIQUE (program_id, session_code, order_idx)` haria chocar
 *    la fila borrada con la nueva que ocupa ese lugar. Es seguro porque
 *    `set_logs` guarda `exercise_name` desnormalizado y su FK es ON DELETE SET
 *    NULL — el historial sobrevive al borrado (verificado en verify-schema).
 * 3. NO se pisa una version mas nueva con una mas vieja. Cada sincronizacion
 *    sube todos los programas propios, tambien los que no cambiaron: sin esta
 *    guarda, un segundo dispositivo con una copia vieja deshacia en el servidor
 *    lo que se acababa de editar en el primero. El borrado de un ejercicio era
 *    el caso mas visible — reaparecia solo.
 *
 *    La marca de tiempo es la del USUARIO (`program.updatedAt`), no la del
 *    servidor: lo que importa es cuando se edito, no cuando se subio.
 */
export async function saveProgram(ownerUserId, program) {
  const ts = now();
  const id = program.id || uid();

  const editadoEn = aIso(program.updatedAt) || ts;
  const actual = await getDb().execute({
    sql: "SELECT updated_at FROM programs WHERE id = ? AND deleted_at IS NULL",
    args: [id],
  });
  if (actual.rows[0] && actual.rows[0].updated_at > editadoEn) {
    return { ...(await getProgram(id)), ignorado: true };
  }

  const stmts = [];

  stmts.push({
    sql: `INSERT INTO programs (id, owner_user_id, coach_id, name, weeks, has_deload, status, version, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT (id) DO UPDATE SET
            name = excluded.name,
            weeks = excluded.weeks,
            has_deload = excluded.has_deload,
            status = excluded.status,
            version = programs.version + 1,
            updated_at = excluded.updated_at`,
    args: [
      id,
      ownerUserId,
      program.name,
      program.weeks ?? 4,
      program.hasDeload === false ? 0 : 1,
      program.status || "active",
      aIso(program.createdAt) || ts,
      editadoEn,
    ],
  });

  const sessions = program.sessions || [];
  const codes = sessions.map((s) => s.id);
  // Sesiones que ya no estan: se van con sus ejercicios.
  stmts.push({
    sql: `DELETE FROM program_sessions
          WHERE program_id = ?${codes.length ? ` AND code NOT IN (${codes.map(() => "?").join(",")})` : ""}`,
    args: [id, ...codes],
  });
  sessions.forEach((s, i) => {
    stmts.push({
      sql: `INSERT INTO program_sessions (id, program_id, code, name, order_idx, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (program_id, code) DO UPDATE SET
              name = excluded.name, order_idx = excluded.order_idx, updated_at = excluded.updated_at`,
      args: [uid(), id, s.id, s.name, i, ts],
    });
  });

  const exercises = program.exercises || [];
  const exIds = exercises.map((e) => e.id).filter(Boolean);
  stmts.push({
    sql: `DELETE FROM program_exercises
          WHERE program_id = ?${exIds.length ? ` AND id NOT IN (${exIds.map(() => "?").join(",")})` : ""}`,
    args: [id, ...exIds],
  });

  // Pasada 1: sin superset_with.
  for (const e of exercises) {
    stmts.push({
      sql: `INSERT INTO program_exercises
              (id, program_id, session_code, order_idx, name, muscle_group, sets, ref_kg,
               reps_min, reps_max, rep_unit, tempo, rest_sec, rir_target, superset_with,
               technique, description, exercise_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
              session_code = excluded.session_code, order_idx = excluded.order_idx,
              name = excluded.name, muscle_group = excluded.muscle_group, sets = excluded.sets,
              ref_kg = excluded.ref_kg, reps_min = excluded.reps_min, reps_max = excluded.reps_max,
              rep_unit = excluded.rep_unit, tempo = excluded.tempo, rest_sec = excluded.rest_sec,
              rir_target = excluded.rir_target, technique = excluded.technique,
              description = excluded.description, exercise_id = excluded.exercise_id,
              updated_at = excluded.updated_at, deleted_at = NULL`,
      args: [
        e.id || uid(), id, e.session, e.order ?? 0, e.name, e.group ?? null, e.sets ?? 3,
        refToDb(e.refKg), e.repsMin ?? null, e.repsMax ?? null, e.unit || "reps",
        e.tempo ?? null, e.rest ?? null, e.rir ?? null, tecnicaToDb(e.technique),
        e.description || null, e.exerciseId ?? null, ts,
      ],
    });
  }

  // Pasada 2: ahora que existen todos, se vinculan las superseries.
  for (const e of exercises) {
    if (!e.superset) continue;
    stmts.push({
      sql: "UPDATE program_exercises SET superset_with = ?, updated_at = ? WHERE id = ? AND program_id = ?",
      args: [e.superset, ts, e.id, id],
    });
  }

  await tx(stmts);
  return getProgram(id);
}

/**
 * Copia un programa propio con ids nuevos.
 *
 * Es lo que sostiene la decision "un programa por alumno": el entrenador no
 * calibra una plantilla compartida, duplica y adapta. Sin una copia real, editar
 * el programa de Ana le cambiaria la rutina a Beto.
 *
 * Los ids nuevos se generan YA prefijados con el usuario. Si se crearan pelados,
 * el pull se los daria asi al cliente del coach y el push siguiente los volveria
 * a prefijar, creando un segundo programa fantasma en cada sincronizacion.
 */
export async function duplicarPrograma({ programId, ownerUserId, nombre }) {
  const db = getDb();
  const duenio = await db.execute({
    sql: "SELECT 1 FROM programs WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL",
    args: [programId, ownerUserId],
  });
  if (!duenio.rows[0]) return { ok: false, motivo: "programa-ajeno" };

  const original = await getProgram(programId);
  if (!original) return { ok: false, motivo: "programa-ajeno" };

  const nuevoId = (v) => `${ownerUserId}~${v}`;
  const mapa = new Map(original.exercises.map((e) => [e.id, nuevoId(uid())]));

  const copia = await saveProgram(ownerUserId, {
    id: nuevoId(uid()),
    name: nombre || `${original.name} (copia)`,
    weeks: original.weeks,
    hasDeload: original.hasDeload,
    status: original.status,
    sessions: original.sessions,
    exercises: original.exercises.map((e) => ({
      ...e,
      id: mapa.get(e.id),
      superset: e.superset ? mapa.get(e.superset) || null : null,
    })),
  });

  return { ok: true, programa: copia };
}

export async function softDeleteProgram(programId, ownerUserId) {
  const r = await getDb().execute({
    sql: `UPDATE programs SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
    args: [now(), now(), programId, ownerUserId],
  });
  return r.rowsAffected > 0;
}
