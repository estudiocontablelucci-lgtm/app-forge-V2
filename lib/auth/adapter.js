/**
 * Adapter de NextAuth sobre el schema propio.
 *
 * Existe en vez de usar un adapter generico porque la tabla `users` de FORGE es
 * la del dominio (role, body_weight_kg, deleted_at), no la que asume NextAuth.
 * Un adapter de libreria crearia una segunda tabla de usuarios y tendriamos la
 * identidad partida en dos lugares.
 *
 * Con `session.strategy = "jwt"` NextAuth nunca llama a los metodos de sesion,
 * asi que no estan implementados.
 */
import { getDb, now, uid } from "../db.js";

function toAuthUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    image: row.image || null,
    emailVerified: row.email_verified ? new Date(row.email_verified) : null,
    // Campos del dominio que el callback de sesion necesita.
    role: row.role,
  };
}

const USER_COLS = "id, email, display_name, image, email_verified, role";

export function ForgeAdapter() {
  const db = getDb();

  const getUserBy = async (where, value) => {
    const r = await db.execute({
      sql: `SELECT ${USER_COLS} FROM users WHERE ${where} = ? AND deleted_at IS NULL`,
      args: [value],
    });
    return toAuthUser(r.rows[0]);
  };

  return {
    async createUser(user) {
      const email = String(user.email).toLowerCase().trim();
      const ts = now();
      const id = uid();
      await db.execute({
        sql: `INSERT INTO users (id, email, display_name, image, email_verified, role, active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'athlete', 1, ?, ?)
              ON CONFLICT (email) DO NOTHING`,
        args: [
          id, email,
          user.name || email.split("@")[0],
          user.image || null,
          user.emailVerified ? new Date(user.emailVerified).toISOString() : null,
          ts, ts,
        ],
      });
      // Si el email ya existia, ON CONFLICT no inserto nada: se devuelve el
      // usuario real y no el id que se habia generado.
      return getUserBy("email", email);
    },

    getUser: (id) => getUserBy("id", id),

    getUserByEmail: (email) => getUserBy("email", String(email).toLowerCase().trim()),

    async getUserByAccount({ provider, providerAccountId }) {
      const r = await db.execute({
        sql: `SELECT u.id, u.email, u.display_name, u.image, u.email_verified, u.role
              FROM auth_accounts a
              JOIN users u ON u.id = a.user_id
              WHERE a.provider = ? AND a.provider_account_id = ? AND u.deleted_at IS NULL`,
        args: [provider, providerAccountId],
      });
      return toAuthUser(r.rows[0]);
    },

    async updateUser(user) {
      const sets = [];
      const args = [];
      if (user.name !== undefined) { sets.push("display_name = ?"); args.push(user.name); }
      if (user.image !== undefined) { sets.push("image = ?"); args.push(user.image); }
      if (user.emailVerified !== undefined) {
        sets.push("email_verified = ?");
        args.push(user.emailVerified ? new Date(user.emailVerified).toISOString() : null);
      }
      if (sets.length) {
        sets.push("updated_at = ?");
        args.push(now(), user.id);
        await db.execute({ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args });
      }
      return getUserBy("id", user.id);
    },

    async deleteUser(userId) {
      // Soft delete: los logs de entrenamiento cuelgan del usuario y un borrado
      // duro se llevaria puesto el historial.
      await db.execute({
        sql: "UPDATE users SET deleted_at = ?, updated_at = ?, active = 0 WHERE id = ?",
        args: [now(), now(), userId],
      });
    },

    async linkAccount(account) {
      await db.execute({
        sql: `INSERT INTO auth_accounts
                (id, user_id, type, provider, provider_account_id, refresh_token,
                 access_token, expires_at, token_type, scope, id_token, session_state)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (provider, provider_account_id) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                id_token = excluded.id_token`,
        args: [
          uid(), account.userId, account.type, account.provider, account.providerAccountId,
          account.refresh_token ?? null, account.access_token ?? null, account.expires_at ?? null,
          account.token_type ?? null, account.scope ?? null, account.id_token ?? null,
          account.session_state ?? null,
        ],
      });
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await db.execute({
        sql: "DELETE FROM auth_accounts WHERE provider = ? AND provider_account_id = ?",
        args: [provider, providerAccountId],
      });
    },

    async createVerificationToken({ identifier, token, expires }) {
      await db.execute({
        sql: "INSERT INTO auth_verification_tokens (identifier, token, expires) VALUES (?, ?, ?)",
        args: [identifier, token, new Date(expires).toISOString()],
      });
      return { identifier, token, expires };
    },

    /**
     * Consume el token: lo borra y devuelve lo que habia. Si no existe devuelve
     * null y NextAuth rechaza el login — es lo que hace que un magic link sirva
     * una sola vez, incluso si alguien reenvia el mail.
     */
    async useVerificationToken({ identifier, token }) {
      const r = await db.execute({
        sql: `DELETE FROM auth_verification_tokens
              WHERE identifier = ? AND token = ?
              RETURNING identifier, token, expires`,
        args: [identifier, token],
      });
      const row = r.rows[0];
      if (!row) return null;
      return { identifier: row.identifier, token: row.token, expires: new Date(row.expires) };
    },
  };
}
