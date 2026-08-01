/**
 * Usuarios. Es lo que consume NextAuth para resolver la identidad, y el unico
 * lugar donde se crea una fila en `users`.
 *
 * El email es la clave natural (UNIQUE en el schema): un usuario que entra hoy
 * por Google y manana por magic link es el mismo usuario, no dos.
 */
import { getDb, now, uid } from "../db.js";

const COLS = "id, email, display_name, role, body_weight_kg, active, created_at, updated_at";

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    bodyWeightKg: row.body_weight_kg,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findByEmail(email) {
  const r = await getDb().execute({
    sql: `SELECT ${COLS} FROM users WHERE email = ? AND deleted_at IS NULL`,
    args: [String(email).toLowerCase().trim()],
  });
  return toUser(r.rows[0]);
}

export async function findById(id) {
  const r = await getDb().execute({
    sql: `SELECT ${COLS} FROM users WHERE id = ? AND deleted_at IS NULL`,
    args: [id],
  });
  return toUser(r.rows[0]);
}

/**
 * Devuelve el usuario existente o lo crea. Es lo que corre en cada login:
 * el primer login de un email crea la cuenta, los siguientes la encuentran.
 *
 * El INSERT lleva ON CONFLICT sobre email en vez de un check-then-insert:
 * dos logins simultaneos del mismo email no pueden crear dos filas.
 */
export async function findOrCreate({ email, displayName, role = "athlete" }) {
  const mail = String(email).toLowerCase().trim();
  if (!mail) throw new Error("email requerido");

  const ts = now();
  await getDb().execute({
    sql: `INSERT INTO users (id, email, display_name, role, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT (email) DO NOTHING`,
    args: [uid(), mail, displayName || mail.split("@")[0], role, ts, ts],
  });

  return findByEmail(mail);
}

export async function updateProfile(id, { displayName, bodyWeightKg, role }) {
  const sets = [];
  const args = [];
  if (displayName !== undefined) { sets.push("display_name = ?"); args.push(displayName); }
  if (bodyWeightKg !== undefined) { sets.push("body_weight_kg = ?"); args.push(bodyWeightKg); }
  if (role !== undefined) { sets.push("role = ?"); args.push(role); }
  if (!sets.length) return findById(id);

  sets.push("updated_at = ?");
  args.push(now(), id);
  await getDb().execute({
    sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    args,
  });
  return findById(id);
}
