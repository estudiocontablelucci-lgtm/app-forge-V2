/**
 * Verifica que la identidad de la cuenta sea la CASILLA y no la grafia.
 *
 *   node scripts/verify-identidad.mjs
 *
 * Cubre las dos puertas por las que se crea o se resuelve un usuario: el repo
 * (`findOrCreate`) y el adapter de NextAuth (`createUser` / `getUserByEmail`).
 * Entrar una vez con Google —que devuelve el Gmail con puntos— y otra por magic
 * link escribiendolo sin puntos creaba dos cuentas, con el historial partido.
 *
 * Ejercita el adapter REAL, no una copia: es codigo de autenticacion y una
 * version de mentira que se parece no verifica nada.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-identidad.db");
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
const { ForgeAdapter } = await import("../lib/auth/adapter.js");
const { canonicalizarEmail } = await import("../lib/email-id.js");
const adapter = ForgeAdapter();

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

await check("Google primero y magic link despues caen en la misma cuenta", async () => {
  // Google devuelve la direccion como la escribio la persona al registrarse.
  const porGoogle = await adapter.createUser({ email: "olga.lightblue@gmail.com", name: "Olga" });
  // Y despues escribe su mail sin puntos en el formulario del magic link.
  const porLink = await adapter.getUserByEmail("olgalightblue@gmail.com");
  if (!porLink) return "no la encontro: le habria creado una cuenta nueva vacia";
  if (porLink.id !== porGoogle.id) return `dos cuentas: ${porGoogle.id} y ${porLink.id}`;
  return true;
});

await check("y al reves, con la mayuscula y la etiqueta + de por medio", async () => {
  const u = await adapter.getUserByEmail("Olga.LightBlue+gym@Gmail.com");
  if (!u) return "no resolvio la casilla";
  if (u.email !== "olga.lightblue@gmail.com") return `resolvio a ${u.email}`;
  return true;
});

await check("createUser no crea una segunda cuenta para la misma casilla", async () => {
  const antes = await db.execute("SELECT COUNT(*) AS n FROM users");
  const otra = await adapter.createUser({ email: "olgalightblue@gmail.com", name: "Olga otra vez" });
  const despues = await db.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(antes.rows[0].n) !== Number(despues.rows[0].n)) return "creo una cuenta de mas";
  if (otra.email !== "olga.lightblue@gmail.com") return `devolvio ${otra.email}`;
  return true;
});

await check("se guarda la direccion COMO LA ESCRIBIO, no la canonica", async () => {
  // Es la que reconoce cuando la ve y a la que se le manda el mail.
  const r = await db.execute({
    sql: "SELECT email, email_canon FROM users WHERE email_canon = ?",
    args: ["olgalightblue@gmail.com"],
  });
  if (r.rows[0].email !== "olga.lightblue@gmail.com") return `guardo ${r.rows[0].email}`;
  if (r.rows[0].email_canon !== "olgalightblue@gmail.com") return "no guardo la forma canonica";
  return true;
});

await check("en un dominio cualquiera los puntos SIGUEN distinguiendo", async () => {
  // Unificarlos ahi seria darle a una persona la cuenta de otra.
  const a = await users.findOrCreate({ email: "a.b@estudiolucci.com.ar", displayName: "AB" });
  const b = await users.findOrCreate({ email: "ab@estudiolucci.com.ar", displayName: "A B" });
  if (a.id === b.id) return "fusiono dos cuentas distintas";
  return true;
});

await check("findOrCreate del repo usa el mismo criterio que el adapter", async () => {
  const u = await users.findOrCreate({ email: "OLGALIGHTBLUE@gmail.com", displayName: "X" });
  const r = await db.execute("SELECT COUNT(*) AS n FROM users WHERE email_canon = 'olgalightblue@gmail.com'");
  if (Number(r.rows[0].n) !== 1) return `${r.rows[0].n} filas para la misma casilla`;
  if (u.email !== "olga.lightblue@gmail.com") return `devolvio ${u.email}`;
  return true;
});

await check("una cuenta anterior al backfill se sigue encontrando", async () => {
  // Es el riesgo real del cambio: si el fallback exacto no estuviera, alguien
  // que ya tenia cuenta entraria a una nueva y vacia.
  await db.execute({
    sql: `INSERT INTO users (id, email, email_canon, display_name, role, active, created_at, updated_at)
          VALUES ('viejo1', 'juan.perez@gmail.com', NULL, 'Juan', 'athlete', 1, ?, ?)`,
    args: [new Date().toISOString(), new Date().toISOString()],
  });
  const u = await adapter.getUserByEmail("juan.perez@gmail.com");
  if (!u) return "no encontro al usuario que ya existia";
  if (u.id !== "viejo1") return `devolvio ${u.id}`;
  return true;
});

await check("el backfill deja esa cuenta canonicalizada y accesible por las dos grafias", async () => {
  await db.execute({
    sql: "UPDATE users SET email_canon = ? WHERE id = 'viejo1'",
    args: [canonicalizarEmail("juan.perez@gmail.com")],
  });
  const conPuntos = await adapter.getUserByEmail("juan.perez@gmail.com");
  const sinPuntos = await adapter.getUserByEmail("juanperez@gmail.com");
  if (conPuntos?.id !== "viejo1" || sinPuntos?.id !== "viejo1") return "no resuelve por las dos";
  return true;
});

await check("el indice impide que existan dos filas con la misma casilla", async () => {
  try {
    await db.execute({
      sql: `INSERT INTO users (id, email, email_canon, display_name, role, active, created_at, updated_at)
            VALUES ('duplicado', 'j.uan.perez@gmail.com', 'juanperez@gmail.com', 'Juan bis', 'athlete', 1, ?, ?)`,
      args: [new Date().toISOString(), new Date().toISOString()],
    });
    return "la base acepto dos cuentas para la misma casilla";
  } catch {
    return true;
  }
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  identidad: la cuenta es la casilla, no la forma de escribirla");
