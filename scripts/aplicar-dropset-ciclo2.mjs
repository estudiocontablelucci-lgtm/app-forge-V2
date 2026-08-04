/**
 * Marca con dropset los ejercicios que la planilla original ya prescribia.
 *
 *   node scripts/aplicar-dropset-ciclo2.mjs --dry     (solo muestra)
 *   node scripts/aplicar-dropset-ciclo2.mjs           (escribe)
 *
 * La fuente es la hoja "Programa" de `Rutina gym - Claude (TEST CELULAR).xlsx`,
 * que es la tabla operativa: marca "DS ultima serie" en gemelo sentado (A),
 * gemelo prensa 45 (B) y apertura maquina (C), en las cuatro semanas y el
 * deload.
 *
 * NO va en vuelos laterales, aunque la hoja "Contexto" diga lo contrario. Esa
 * hoja quedo vieja —cita la apertura a 65kg cuando la tabla dice 70— y el
 * propio programa explica por que: los vuelos estaban en el tope del rango de
 * reps, asi que se resolvieron subiendo la carga y no al fallo.
 *
 * UNA sola bajada, no dos: la planilla dice "al fallo, bajar peso 20-30% sin
 * descanso y seguir". El default del modulo son dos y aca no corresponde.
 *
 * Idempotente: si ya esta puesto, no escribe.
 */
import { canonicalizarEmail } from "../lib/email-id.js";

const dry = process.argv.includes("--dry");
const email = process.argv.find((a) => a.includes("@")) || "agustin.lucci@gmail.com";

const { getDb, now } = await import("../lib/db.js");
const { tecnicaToDb } = await import("../lib/tecnicas.js");
const db = getDb();

/** Lo que la hoja "Programa" marca con "DS ultima serie". */
const OBJETIVO = [
  { sesion: "A", nombre: "Gemelo sentado" },
  { sesion: "B", nombre: "Gemelo prensa 45" },
  { sesion: "C", nombre: "Apertura máquina" },
];

const DROPSET = tecnicaToDb({ tipo: "dropset", pasos: 1, aplica: "ultima" });

const u = await db.execute({
  sql: "SELECT id, email FROM users WHERE email_canon = ? OR email = ?",
  args: [canonicalizarEmail(email), email],
});
if (!u.rows[0]) {
  console.error(`no hay usuario para ${email}`);
  process.exit(1);
}
const userId = u.rows[0].id;

const p = await db.execute({
  sql: `SELECT id, name FROM programs
        WHERE owner_user_id = ? AND name LIKE '%Ciclo 2%' AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
  args: [userId],
});
if (!p.rows[0]) {
  console.error("no encontre el programa del Ciclo 2");
  process.exit(1);
}
const programa = p.rows[0];
console.log(`programa: ${programa.name}  (${programa.id})`);
console.log(`tecnica:  ${DROPSET}\n`);

const cambios = [];
for (const o of OBJETIVO) {
  const r = await db.execute({
    sql: `SELECT id, name, session_code, sets, technique FROM program_exercises
          WHERE program_id = ? AND session_code = ? AND name = ? AND deleted_at IS NULL`,
    args: [programa.id, o.sesion, o.nombre],
  });
  if (!r.rows.length) {
    console.log(`  NO ESTA  ${o.sesion} · ${o.nombre}`);
    continue;
  }
  for (const e of r.rows) {
    if (e.technique === DROPSET) {
      console.log(`  =        ${e.session_code} · ${e.name} (ya lo tenia)`);
      continue;
    }
    console.log(`  +        ${e.session_code} · ${e.name}  ${e.technique ? `(tenia ${e.technique})` : ""}`);
    cambios.push(e.id);
  }
}

if (!cambios.length) {
  console.log("\nnada que cambiar");
  process.exit(0);
}
if (dry) {
  console.log(`\n--dry: no se escribio nada (${cambios.length} cambio/s pendiente/s)`);
  process.exit(0);
}

const ts = now();
const stmts = cambios.map((id) => ({
  sql: "UPDATE program_exercises SET technique = ?, updated_at = ? WHERE id = ?",
  args: [DROPSET, ts, id],
}));
// El programa entero se marca como editado AHORA. Sin esto el telefono, que
// tiene una copia mas nueva, gana el merge y deshace el cambio al sincronizar.
stmts.push({
  sql: "UPDATE programs SET updated_at = ? WHERE id = ?",
  args: [ts, programa.id],
});
await db.batch(stmts, "write");
console.log(`\nescrito: ${cambios.length} ejercicio(s) + la marca de edicion del programa`);
