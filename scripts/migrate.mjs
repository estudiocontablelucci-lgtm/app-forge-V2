/**
 * Aplica las migraciones de db/*.sql en orden, una sola vez cada una.
 *
 *   node scripts/migrate.mjs                 -> db/local.db (archivo local, para desarrollo)
 *   node scripts/migrate.mjs --url=file:x.db -> archivo explicito
 *   DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/migrate.mjs
 *
 * Es idempotente: lee schema_migrations y saltea lo ya aplicado.
 * NUNCA toca una migracion ya aplicada — para cambiar algo, se agrega una v02.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbDir = resolve(root, "db");

const urlArg = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
const url = urlArg || process.env.DATABASE_URL || `file:${resolve(dbDir, "local.db")}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
if (url.startsWith("libsql://") && !authToken) {
  console.error("Falta TURSO_AUTH_TOKEN para una URL remota.");
  process.exit(1);
}

const db = createClient({ url, authToken });
console.log(`destino: ${url.replace(/\/\/[^@]*@/, "//***@")}`);

await db.execute("PRAGMA foreign_keys = ON");
await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY, applied_at TEXT NOT NULL
)`);

const aplicadas = new Set(
  (await db.execute("SELECT version FROM schema_migrations")).rows.map((r) => r.version),
);

const archivos = readdirSync(dbDir).filter((f) => /^v\d+_.*\.sql$/.test(f)).sort();
if (!archivos.length) { console.log("sin migraciones en db/"); process.exit(0); }

let aplicadasAhora = 0;
for (const archivo of archivos) {
  const version = archivo.match(/^(v\d+)_/)[1];
  if (aplicadas.has(version)) { console.log(`  = ${archivo} (ya aplicada)`); continue; }

  const sql = readFileSync(resolve(dbDir, archivo), "utf8");
  // Se separa por ";" a fin de linea: alcanza porque las migraciones no llevan
  // triggers ni bloques BEGIN...END. Si alguna vez los lleva, cambiar el split.
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

  try {
    await db.batch(statements, "write");
    await db.execute({
      sql: "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      args: [version, new Date().toISOString()],
    });
    console.log(`  + ${archivo} (${statements.length} statements)`);
    aplicadasAhora++;
  } catch (e) {
    console.error(`  ! ${archivo} fallo: ${e.message}`);
    process.exit(1);
  }
}

const tablas = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log(`\n${aplicadasAhora} migracion(es) nueva(s) · ${tablas.rows.length} tablas`);
console.log(tablas.rows.map((r) => r.name).join(", "));
