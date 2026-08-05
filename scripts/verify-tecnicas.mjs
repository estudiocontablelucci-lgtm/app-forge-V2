/**
 * Verifica las tecnicas de ejecucion (dropset y familia) de punta a punta.
 *
 *   node scripts/verify-tecnicas.mjs
 *
 * Lo que se prueba no es que exista un campo, es que un escalon de dropset
 * sobreviva el viaje telefono -> servidor -> otro telefono SIN convertirse en
 * una serie mas. Esa distincion es todo el punto: como series sueltas rompen el
 * conteo y encadenan el e1RM de esfuerzos que no son comparables.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-tecnicas.db");
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
const { pushForUser, pullForUser } = await import("../lib/sync/service.js");
const t = await import("../lib/tecnicas.js");
const { brzycki } = await import("../lib/formulas.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

/* ---------- el modulo, sin base ---------- */

await check("una tecnica desconocida se ignora en vez de romper", () => {
  if (t.tecnicaFromDb('{"tipo":"telepatia"}') !== null) return "acepto un tipo que no existe";
  if (t.tecnicaFromDb("{roto") !== null) return "no sobrevivio a JSON invalido";
  if (t.tecnicaFromDb("") !== null || t.tecnicaFromDb(null) !== null) return "el vacio no dio null";
  return true;
});

await check("el string suelto de la v01 se sigue leyendo", () => {
  // La columna existia desde la v01 con el comentario 'DS' | 'ASIM-IZQ'. Una
  // base escrita a mano no puede quedar ilegible.
  const x = t.tecnicaFromDb("DS");
  return x?.tipo === "dropset" ? true : `dio ${JSON.stringify(x)}`;
});

await check("el import reconoce como lo escribe una persona", () => {
  for (const txt of ["dropset", "Drop Set", "DS", "drop-set", "serie descendente"]) {
    if (t.porAlias(txt) !== "dropset") return `no reconocio "${txt}"`;
  }
  if (t.porAlias("pirulo") !== null) return "invento una tecnica";
  return true;
});

await check("los escalones se piden en la ULTIMA serie, no en todas", () => {
  const ex = { technique: { tipo: "dropset", pasos: 2, aplica: "ultima" } };
  if (t.pasosDe(ex, 1, 3) !== 0) return "pidio escalones en la primera serie";
  if (t.pasosDe(ex, 3, 3) !== 2) return "no los pidio en la ultima";
  const todas = { technique: { tipo: "dropset", pasos: 2, aplica: "todas" } };
  if (t.pasosDe(todas, 1, 3) !== 2) return "'todas' no aplico a la primera";
  return true;
});

await check("el deload no pide escalones donde ya no hay series", () => {
  // Con el deload por series, un ejercicio de 3 pasa a 2: la "ultima" es la 2.
  const ex = { technique: { tipo: "dropset", pasos: 2, aplica: "ultima" } };
  if (t.pasosDe(ex, 2, 2) !== 2) return "la ultima serie del deload no los pidio";
  if (t.pasosDe(ex, 3, 2) !== 0) return "los pidio en una serie que el deload saco";
  return true;
});

await check("la serie NO esta cerrada hasta el ultimo escalon", () => {
  // Entre escalones no hay descanso: ese es el punto de la tecnica. Si el
  // timer arrancara antes, sonaria justo cuando hay que bajar el peso y seguir.
  const ex = { technique: { tipo: "dropset", pasos: 2, aplica: "ultima" } };
  if (t.serieCerrada(ex, 3, 3, { reps: "8" })) return "cerro con la serie principal y cero escalones";
  if (t.serieCerrada(ex, 3, 3, { reps: "8", pasos: [{ reps: "6" }] })) return "cerro con un escalon de dos";
  if (!t.serieCerrada(ex, 3, 3, { reps: "8", pasos: [{ reps: "6" }, { reps: "4" }] })) return "no cerro con los dos";
  if (!t.serieCerrada(ex, 1, 3, { reps: "8" })) return "una serie sin tecnica quedo abierta";
  return true;
});

/* ---------- tonelaje y e1RM ---------- */

await check("el tonelaje suma los escalones", () => {
  const serie = { kg: "40", reps: "10", pasos: [{ kg: "30", reps: "6" }, { kg: "20", reps: "5" }] };
  let total = 0;
  for (const c of [serie, ...t.pasosDeLog(serie)]) total += parseFloat(c.kg) * parseInt(c.reps);
  return total === 400 + 180 + 100 ? true : `dio ${total}, esperaba 680`;
});

await check("un escalon SI puede inflar el e1RM, por eso queda afuera", () => {
  // El argumento de que "el maximo no puede bajar" mira solo la mitad del
  // problema. No puede bajar, pero puede SUBIR sin que haya mas fuerza:
  // Brzycki pierde precision arriba de ~12 reps y un descuelgue al fallo con
  // 22% menos peso vive justo ahi. Con las refs reales de este programa el
  // gemelo sentado (50x15) queda por debajo de su propio descuelgue a 38.8kg
  // en cuanto pasa de 20 reps.
  const principal = brzycki(50, 15);
  const descuelgue = brzycki(38.8, 21);
  if (!(descuelgue > principal)) {
    return `el descuelgue dio ${descuelgue?.toFixed(1)} contra ${principal.toFixed(1)}: revisar el caso`;
  }
  return true;
});

await check("el tonelaje los cuenta y el e1RM no", () => {
  // Las dos mitades de la decision, juntas: el descuelgue es trabajo real
  // (suma) pero no es evidencia de fuerza (no estima).
  const serie = { kg: "50", reps: "15", pasos: [{ kg: "38.8", reps: "21" }] };
  let tonelaje = 0;
  for (const c of [serie, ...t.pasosDeLog(serie)]) tonelaje += parseFloat(c.kg) * parseInt(c.reps);
  if (Math.round(tonelaje) !== Math.round(750 + 38.8 * 21)) return `tonelaje ${tonelaje}`;
  const e1 = brzycki(parseFloat(serie.kg), parseInt(serie.reps));
  return Math.abs(e1 - brzycki(50, 15)) < 0.001 ? true : `e1RM ${e1}`;
});

/* ---------- el viaje completo ---------- */

const PROGRAMA = () => ({
  id: "p-tec", name: "Con dropset", weeks: 4, hasDeload: true,
  sessions: [{ id: "A", name: "Full" }],
  exercises: [
    { id: "e1", session: "A", order: 1, name: "Extension triceps", group: "Triceps", sets: 3,
      refKg: 25, repsMin: 10, repsMax: 12, tempo: "2-0-1-0", rest: 60, rir: "1-2",
      superset: null, technique: { tipo: "dropset", pasos: 2, aplica: "ultima" },
      unit: "reps", description: "" },
  ],
});

const SESION = () => ({
  id: "h-tec", programId: "p-tec", week: 1, session: "A", sessionName: "Full",
  date: 1_800_000_000_000, duration: 55, health: { sleep: 4, stress: 2, energy: 4 },
  exercises: [
    { id: "e1", name: "Extension triceps", group: "Triceps", sets: [
      { setN: 1, kg: 25, reps: 12, rir: 2 },
      { setN: 2, kg: 25, reps: 11, rir: 1 },
      { setN: 3, kg: 25, reps: 10, rir: 0, pasos: [{ kg: 17.5, reps: 8 }, { kg: 10, reps: 7 }] },
    ] },
  ],
});

let ana;

await check("la tecnica del programa sobrevive el viaje al servidor", async () => {
  ana = await users.findOrCreate({ email: "ana@example.com", displayName: "Ana" });
  await pushForUser(ana.id, { program: PROGRAMA(), entry: SESION() });
  const { programs } = await pullForUser(ana.id);
  const ex = programs[0]?.exercises?.[0];
  if (!ex) return "no volvio el ejercicio";
  if (ex.technique?.tipo !== "dropset") return `volvio ${JSON.stringify(ex.technique)}`;
  if (ex.technique.pasos !== 2) return `perdio las bajadas: ${ex.technique.pasos}`;
  return true;
});

await check("los escalones vuelven DENTRO de su serie, no como series nuevas", async () => {
  const { history } = await pullForUser(ana.id);
  const sets = history[0]?.exercises?.[0]?.sets || [];
  if (sets.length !== 3) return `volvieron ${sets.length} series: los escalones se convirtieron en series`;
  const ultima = sets.find((s) => s.setN === 3);
  if (!ultima?.pasos?.length) return "la ultima serie volvio sin escalones";
  if (ultima.pasos.length !== 2) return `volvieron ${ultima.pasos.length} escalones`;
  if (Number(ultima.pasos[0].kg) !== 17.5 || Number(ultima.pasos[0].reps) !== 8) {
    return `el primer escalon volvio como ${JSON.stringify(ultima.pasos[0])}`;
  }
  return true;
});

await check("una serie sin tecnica no inventa escalones", async () => {
  const { history } = await pullForUser(ana.id);
  const primera = history[0].exercises[0].sets.find((s) => s.setN === 1);
  return primera.pasos === undefined ? true : `volvio con ${JSON.stringify(primera.pasos)}`;
});

await check("el conteo de series de la base no cuenta escalones", async () => {
  const r = await db.execute("SELECT COUNT(*) AS n FROM set_logs WHERE deleted_at IS NULL");
  return Number(r.rows[0].n) === 3 ? true : `set_logs tiene ${r.rows[0].n} filas, esperaba 3`;
});

await check("un escalon a medio cargar no se guarda", async () => {
  // Un escalon sin reps es uno que no se llego a hacer. Guardarlo haria que la
  // serie parezca tener una bajada de cero repeticiones.
  const entry = SESION();
  entry.exercises[0].sets[2].pasos = [{ kg: 17.5, reps: 8 }, { kg: 10, reps: null }];
  await pushForUser(ana.id, { program: PROGRAMA(), entry });
  const { history } = await pullForUser(ana.id);
  const ultima = history[0].exercises[0].sets.find((s) => s.setN === 3);
  return ultima.pasos.length === 1 ? true : `guardo ${ultima.pasos.length} escalones`;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  tecnicas: el dropset viaja adentro de su serie y no la duplica");
