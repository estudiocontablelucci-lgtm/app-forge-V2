/**
 * Rellena `users.email_canon` en las filas anteriores a la v05.
 *
 *   node scripts/backfill-email-canon.mjs            # local
 *   node scripts/backfill-email-canon.mjs --aplicar  # escribe (sin esto solo informa)
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/backfill-email-canon.mjs --aplicar
 *
 * Va en JS y no en la migracion porque canonicalizar depende del DOMINIO: en
 * Gmail los puntos no cuentan, en un servidor cualquiera si, y SQL no tiene
 * forma de saber la diferencia. Escribir esa logica dos veces es garantizar que
 * un dia difieran.
 *
 * NO FUSIONA NADA. Si dos cuentas resultan ser la misma casilla, lo informa y
 * sale sin tocar la base: unir dos historiales de entrenamiento es una decision
 * de producto, no un efecto secundario de una migracion.
 *
 * Es idempotente: las filas que ya tienen `email_canon` se saltean.
 */
import { createClient } from "@libsql/client";
import { canonicalizarEmail } from "../lib/email-id.js";

const aplicar = process.argv.includes("--aplicar");
const url = process.env.DATABASE_URL || "file:db/local.db";
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
if (url.startsWith("libsql://") && !authToken) {
  console.error("Falta TURSO_AUTH_TOKEN para una URL remota.");
  process.exit(1);
}

const db = createClient({ url, authToken });
console.log(`destino: ${url.replace(/\/\/[^@]*@/, "//***@")}`);
console.log(aplicar ? "modo: ESCRIBE\n" : "modo: solo informa (--aplicar para escribir)\n");

const r = await db.execute(
  "SELECT id, email, display_name, email_canon FROM users WHERE deleted_at IS NULL ORDER BY created_at",
);

const pendientes = r.rows.filter((u) => !u.email_canon);
console.log(`${r.rows.length} usuarios · ${pendientes.length} sin canonicalizar`);

// Colisiones contra TODAS las filas, no solo entre las pendientes: una fila ya
// rellenada puede chocar con una que falta.
const porCanon = new Map();
for (const u of r.rows) {
  const c = u.email_canon || canonicalizarEmail(u.email);
  if (!porCanon.has(c)) porCanon.set(c, []);
  porCanon.get(c).push(u);
}

const choques = [...porCanon.entries()].filter(([, us]) => us.length > 1);
if (choques.length) {
  console.error("\nDOS CUENTAS PARA LA MISMA CASILLA. No se escribe nada:\n");
  for (const [canon, us] of choques) {
    console.error(`  ${canon}`);
    for (const u of us) console.error(`      ${u.id}  ${u.email}  (${u.display_name})`);
  }
  console.error("\nFusionar historiales es una decision de producto. Resolver a mano y volver a correr.");
  process.exit(1);
}

if (!pendientes.length) {
  console.log("\nNada que hacer.");
  process.exit(0);
}

for (const u of pendientes) {
  const canon = canonicalizarEmail(u.email);
  console.log(`  ${u.email}  ->  ${canon}`);
  if (aplicar) {
    await db.execute({
      sql: "UPDATE users SET email_canon = ? WHERE id = ?",
      args: [canon, u.id],
    });
  }
}

console.log(aplicar ? `\n${pendientes.length} fila(s) actualizada(s).` : "\nNada escrito. Correr con --aplicar.");
