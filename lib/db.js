/**
 * Cliente libSQL contra Turso. Unico punto donde se abre una conexion.
 *
 * En dev sin DATABASE_URL cae a db/local.db, que es la misma base que aplica
 * `npm run migrate` — asi se puede trabajar sin credenciales.
 */
import { createClient } from "@libsql/client";

let client = null;

export function getDb() {
  if (client) return client;

  const url = process.env.DATABASE_URL || "file:db/local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  if (url.startsWith("libsql://") && !authToken) {
    throw new Error("DATABASE_URL es remota pero falta TURSO_AUTH_TOKEN");
  }

  client = createClient({ url, authToken });
  return client;
}

/** ISO-8601 UTC — el formato que usa todo el schema para timestamps. */
export function now() {
  return new Date().toISOString();
}

/**
 * id base36 aleatorio, mismo formato que `uid()` del cliente. Los ids se generan
 * del lado que crea la fila (incluido el browser offline), nunca por autoincrement.
 */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Corre varias sentencias como una unidad. libSQL no expone BEGIN/COMMIT sueltos
 * sobre HTTP: `batch` con modo "write" es la transaccion.
 */
export async function tx(statements) {
  return getDb().batch(statements, "write");
}
