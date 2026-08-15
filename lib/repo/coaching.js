/**
 * Entrenadores, invitaciones y vinculo con alumnos.
 *
 * Dos reglas de producto que estan implementadas aca y no en la UI, para que
 * valgan venga de donde venga la llamada:
 *
 *   - El espacio de entrenador se crea al invitar al primer alumno. No existe
 *     "crear coach" como accion suelta, asi no hay espacios vacios.
 *   - Dejar de ser alumno libera el cupo pero NO borra nada: el vinculo pasa a
 *     'ended'. Los entrenamientos son del alumno, no del entrenador.
 */
import { getDb, now, uid } from "../db.js";
import { canonicalizarEmail, mismoEmail } from "../email-id.js";

/* ---------- entrenador ---------- */

/** El coach de este usuario, si ya invito a alguien alguna vez. */
export async function getCoachDe(userId) {
  const r = await getDb().execute({
    sql: `SELECT id, owner_user_id, name, plan, max_athletes, created_at
          FROM coaches WHERE owner_user_id = ? AND deleted_at IS NULL LIMIT 1`,
    args: [userId],
  });
  const c = r.rows[0];
  return c ? { id: c.id, ownerUserId: c.owner_user_id, name: c.name, plan: c.plan, maxAthletes: c.max_athletes } : null;
}

/** Cuenta los alumnos que ocupan cupo: solo los activos y los invitados. */
export async function contarAlumnos(coachId) {
  const [activos, pendientes] = await Promise.all([
    getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM coach_athletes WHERE coach_id = ? AND status IN ('active','invited')",
      args: [coachId],
    }),
    getDb().execute({
      sql: "SELECT COUNT(*) AS n FROM coach_invites WHERE coach_id = ? AND status = 'pending'",
      args: [coachId],
    }),
  ]);
  return Number(activos.rows[0].n) + Number(pendientes.rows[0].n);
}

/* ---------- invitaciones ---------- */

const DIAS_VIGENCIA = 14;

/**
 * Invita a un alumno por email. Crea el espacio de entrenador si es la primera.
 *
 * Devuelve `{ ok: false, motivo }` en vez de tirar excepcion para los casos que
 * son respuesta esperada del negocio (cupo lleno, ya invitado) y no un error.
 */
export async function invitar({ ownerUserId, email, nombreCoach }) {
  const db = getDb();
  // Se guarda la forma CANONICA porque este campo es una clave de coincidencia,
  // no un dato para mostrar: es contra lo que se busca cuando la persona entra.
  // Guardarlo como lo escribio el entrenador hacia que invitar a
  // `olga.lightblue@gmail.com` no matcheara con quien se registro como
  // `olgalightblue@gmail.com`, que en Gmail es exactamente la misma casilla.
  // De paso, dos invitaciones a la misma casilla escritas distinto ahora chocan
  // contra el indice unico en vez de convivir.
  const mail = canonicalizarEmail(email);
  if (!mail || !mail.includes("@")) return { ok: false, motivo: "email-invalido" };

  const ts = now();
  let coach = await getCoachDe(ownerUserId);

  if (!coach) {
    // Primera invitacion: aca nace el espacio de entrenador.
    const id = uid();
    await db.execute({
      sql: `INSERT INTO coaches (id, owner_user_id, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, ownerUserId, nombreCoach || "Mi espacio", ts, ts],
    });
    await db.execute({
      sql: "UPDATE users SET role = CASE WHEN role = 'athlete' THEN 'both' ELSE role END, updated_at = ? WHERE id = ?",
      args: [ts, ownerUserId],
    });
    coach = await getCoachDe(ownerUserId);
  }

  // No se puede invitar a alguien que ya es alumno activo. La comparacion se
  // hace en JS y no en SQL porque canonicalizar depende del dominio: SQLite no
  // sabe que en Gmail los puntos no cuentan. Son los alumnos de un coach, no
  // una tabla entera, asi que traerlos sale barato.
  const suyos = await db.execute({
    sql: `SELECT u.email FROM coach_athletes ca JOIN users u ON u.id = ca.athlete_id
          WHERE ca.coach_id = ? AND ca.status IN ('active','invited')`,
    args: [coach.id],
  });
  if (suyos.rows.some((r) => mismoEmail(r.email, mail))) return { ok: false, motivo: "ya-es-alumno" };

  if (await contarAlumnos(coach.id) >= coach.maxAthletes) {
    return { ok: false, motivo: "cupo-lleno", maxAthletes: coach.maxAthletes };
  }

  const token = `${uid()}${uid()}`;
  const expira = new Date(Date.now() + DIAS_VIGENCIA * 86400000).toISOString();
  try {
    await db.execute({
      sql: `INSERT INTO coach_invites (id, coach_id, email, token, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      args: [uid(), coach.id, mail, token, ts, expira],
    });
  } catch (e) {
    // El indice unico parcial impide dos invitaciones vivas al mismo email.
    if (String(e.message).includes("UNIQUE")) return { ok: false, motivo: "ya-invitado" };
    throw e;
  }

  return { ok: true, coachId: coach.id, token, email: mail, expiraEn: expira };
}

/** Invitaciones pendientes de un email, para ofrecerlas al iniciar sesion. */
export async function invitacionesPara(email) {
  const r = await getDb().execute({
    sql: `SELECT i.id, i.coach_id, i.token, i.expires_at, c.name AS coach_name, u.display_name AS coach_owner
          FROM coach_invites i
          JOIN coaches c ON c.id = i.coach_id
          JOIN users u   ON u.id = c.owner_user_id
          WHERE i.email = ? AND i.status = 'pending' AND i.expires_at > ?`,
    // Contra la forma canonica, que es como se guardan. Sin esto, quien se
    // registra escribiendo su Gmail con puntos no ve ninguna invitacion: no le
    // aparece un error, le aparece una pantalla vacia.
    args: [canonicalizarEmail(email), now()],
  });
  return r.rows.map((i) => ({
    id: i.id, coachId: i.coach_id, token: i.token,
    coachName: i.coach_name, coachOwner: i.coach_owner, expiraEn: i.expires_at,
  }));
}

/**
 * Acepta una invitacion y crea el vinculo.
 *
 * El consentimiento de datos de salud se registra en el mismo movimiento: a
 * partir de aca el entrenador ve notas y lesiones del alumno, que son dato
 * sensible (Ley 25.326) y no pueden compartirse sin consentimiento expreso.
 */
export async function aceptarInvitacion({ token, userId, email, politica = "v1" }) {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, coach_id, email, expires_at, status FROM coach_invites WHERE token = ?`,
    args: [token],
  });
  const inv = r.rows[0];
  if (!inv) return { ok: false, motivo: "no-existe" };
  if (inv.status !== "pending") return { ok: false, motivo: "ya-usada" };
  if (inv.expires_at <= now()) return { ok: false, motivo: "vencida" };
  // El link es de una casilla concreta: no sirve para que entre otra persona.
  // "La misma casilla" se decide canonicamente — escribir el propio Gmail con
  // puntos o sin puntos no puede ser la diferencia entre entrar y no entrar.
  if (email && !mismoEmail(email, inv.email)) return { ok: false, motivo: "otro-email" };

  const ts = now();
  await db.batch([
    {
      sql: `INSERT INTO coach_athletes (coach_id, athlete_id, status, invite_email, invited_at, accepted_at, updated_at)
            VALUES (?, ?, 'active', ?, ?, ?, ?)
            ON CONFLICT (coach_id, athlete_id) DO UPDATE SET
              status = 'active', accepted_at = excluded.accepted_at,
              ended_at = NULL, updated_at = excluded.updated_at`,
      args: [inv.coach_id, userId, inv.email, ts, ts, ts],
    },
    {
      sql: `INSERT INTO health_consents (id, user_id, granted_to, scope, granted_at, policy_version)
            VALUES (?, ?, ?, 'health_notes', ?, ?)`,
      args: [uid(), userId, inv.coach_id, ts, politica],
    },
    {
      sql: "UPDATE coach_invites SET status = 'accepted', accepted_at = ?, accepted_by = ? WHERE id = ?",
      args: [ts, userId, inv.id],
    },
  ], "write");

  return { ok: true, coachId: inv.coach_id };
}

export async function revocarInvitacion({ coachId, invitacionId }) {
  const r = await getDb().execute({
    sql: "UPDATE coach_invites SET status = 'revoked' WHERE id = ? AND coach_id = ? AND status = 'pending'",
    args: [invitacionId, coachId],
  });
  return r.rowsAffected > 0;
}

/* ---------- alumnos ---------- */

export async function listarAlumnos(coachId) {
  const r = await getDb().execute({
    sql: `SELECT ca.athlete_id, ca.status, ca.accepted_at, ca.notes_seen_at,
                 u.display_name, u.email,
                 (SELECT MAX(sl.performed_at) FROM session_logs sl
                   WHERE sl.athlete_id = ca.athlete_id AND sl.deleted_at IS NULL) AS ultima,
                 (SELECT COUNT(*) FROM session_logs sl
                   WHERE sl.athlete_id = ca.athlete_id AND sl.deleted_at IS NULL
                     AND sl.performed_at >= datetime('now', '-7 days')) AS sesiones7,
                 (SELECT COUNT(*) FROM session_logs sl
                   WHERE sl.athlete_id = ca.athlete_id AND sl.deleted_at IS NULL
                     AND sl.note IS NOT NULL AND TRIM(sl.note) <> ''
                     AND (ca.notes_seen_at IS NULL OR sl.performed_at > ca.notes_seen_at)) AS notas_nuevas
          FROM coach_athletes ca
          JOIN users u ON u.id = ca.athlete_id
          WHERE ca.coach_id = ? AND ca.status = 'active' AND u.deleted_at IS NULL
          ORDER BY u.display_name`,
    args: [coachId],
  });
  return r.rows.map((a) => ({
    id: a.athlete_id, name: a.display_name, email: a.email,
    status: a.status, desde: a.accepted_at,
    // Lo que hace falta para saber a quien mirar SIN entrar a cada ficha.
    ultima: a.ultima || null,
    sesiones7: Number(a.sesiones7) || 0,
    notasNuevas: Number(a.notas_nuevas) || 0,
  }));
}

/**
 * A quien avisarle de lo que hace este alumno: el entrenador que lo tiene
 * ACTIVO, con su mail. Null si entrena solo, que es el caso normal.
 */
export async function entrenadorDe(athleteId) {
  const r = await getDb().execute({
    sql: `SELECT c.id AS coach_id, u.email, u.display_name
          FROM coach_athletes ca
          JOIN coaches c ON c.id = ca.coach_id AND c.deleted_at IS NULL
          JOIN users u   ON u.id = c.owner_user_id AND u.deleted_at IS NULL
          WHERE ca.athlete_id = ? AND ca.status = 'active'
          LIMIT 1`,
    args: [athleteId],
  });
  const c = r.rows[0];
  return c ? { coachId: c.coach_id, email: c.email, nombre: c.display_name } : null;
}

/**
 * El entrenador vio las notas de este alumno.
 *
 * Se marca al ABRIR la ficha, que es donde estan: verlas es leerlas, y pedir
 * un "marcar como leido" aparte seria una tarea nueva para el mismo hecho.
 */
export async function marcarNotasVistas({ coachId, athleteId }) {
  await getDb().execute({
    sql: `UPDATE coach_athletes SET notes_seen_at = ?, updated_at = ?
          WHERE coach_id = ? AND athlete_id = ? AND status = 'active'`,
    args: [now(), now(), coachId, athleteId],
  });
}

/**
 * Da de baja a un alumno: libera el cupo y corta el acceso del entrenador a sus
 * datos, sin borrar nada. Su historial es suyo y sigue en su cuenta; si vuelve,
 * el vinculo se reactiva con todo lo anterior.
 */
export async function darDeBaja({ coachId, athleteId }) {
  const ts = now();
  const db = getDb();
  await db.batch([
    {
      sql: `UPDATE coach_athletes SET status = 'ended', ended_at = ?, updated_at = ?
            WHERE coach_id = ? AND athlete_id = ? AND status IN ('active','invited')`,
      args: [ts, ts, coachId, athleteId],
    },
    // Se revoca el consentimiento: el entrenador deja de poder ver sus notas.
    {
      sql: `UPDATE health_consents SET revoked_at = ?
            WHERE user_id = ? AND granted_to = ? AND revoked_at IS NULL`,
      args: [ts, athleteId, coachId],
    },
  ], "write");
  return true;
}

/** true si el entrenador puede ver los datos de ese alumno ahora mismo. */
export async function puedeVer({ coachId, athleteId }) {
  const r = await getDb().execute({
    sql: `SELECT 1 FROM coach_athletes
          WHERE coach_id = ? AND athlete_id = ? AND status = 'active' LIMIT 1`,
    args: [coachId, athleteId],
  });
  return r.rows.length > 0;
}
