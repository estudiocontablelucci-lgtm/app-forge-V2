/**
 * Verifica que el catalogo de ejercicios sobreviva al viaje al servidor.
 *
 *   node scripts/verify-catalog-sync.mjs
 *
 * Lo que se prueba es una IDENTIDAD, no un dato: que "Prensa horizontal" sea el
 * mismo ejercicio en el celular, en la compu y en la base. De eso depende que la
 * app sepa distinguir "corregi el nombre" de "cambie de maquina", y esa
 * distincion decide si el e1RM se encadena o arranca de cero.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-catalog-sync.db");
for (const suf of ["", "-journal", "-wal", "-shm"]) { try { rmSync(dbPath + suf); } catch {} }

process.env.DATABASE_URL = `file:${dbPath}`;
delete process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url: process.env.DATABASE_URL });
// Con las FK PRENDIDAS a proposito: si un programa referencia un ejercicio que
// no existe, se quiere que explote aca y no en produccion.
await db.execute("PRAGMA foreign_keys = ON");
for (const f of readdirSync(resolve(root, "db")).filter((f) => /^v\d+_.*\.sql$/.test(f)).sort()) {
  const stmts = readFileSync(resolve(root, "db", f), "utf8")
    .split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  await db.batch(stmts, "write");
}

const users = await import("../lib/repo/users.js");
const cat = await import("../lib/repo/catalog.js");
const { pushProgramForUser, pushCatalogForUser, pullForUser } = await import("../lib/sync/service.js");
const { mergeCatalog } = await import("../lib/sync/client.js");
const { CATALOGO_BASE } = await import("../lib/catalog.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

const ana = await users.findOrCreate({ email: "ana@cat.test", displayName: "Ana" });
const beto = await users.findOrCreate({ email: "beto@cat.test", displayName: "Beto" });

// Catalogo tipico: el base que trae la app mas dos propios.
const propioAna = { id: "ex-prensa-horizontal-a1b2", name: "Prensa horizontal", group: "Cuádriceps", unit: "reps", base: false };
const propioBeto = { id: "ex-prensa-horizontal-z9y8", name: "Prensa horizontal", group: "Cuádriceps", unit: "reps", base: false };
const catAna = [...CATALOGO_BASE, propioAna];

await check("el catalogo base sube una sola vez y queda compartido", async () => {
  await pushCatalogForUser(ana.id, catAna);
  await pushCatalogForUser(beto.id, CATALOGO_BASE);
  const r = await db.execute("SELECT COUNT(*) AS n FROM exercises WHERE is_base = 1");
  if (Number(r.rows[0].n) !== CATALOGO_BASE.length) {
    return `${r.rows[0].n} filas base, esperaba ${CATALOGO_BASE.length} — se duplico por usuario`;
  }
  return true;
});

await check("los ids del catalogo base NO se prefijan", async () => {
  const r = await db.execute("SELECT id FROM exercises WHERE is_base = 1 LIMIT 1");
  if (String(r.rows[0].id).includes("~")) return `id base prefijado: ${r.rows[0].id}`;
  return true;
});

await check("dos usuarios pueden tener un ejercicio propio con el mismo nombre", async () => {
  // Antes de la v04 el dueno era el coach: un atleta sin espacio de entrenador
  // solo podia guardar con coach_id NULL, o sea publicarlo en el catalogo base.
  await pushCatalogForUser(beto.id, [propioBeto]);
  const r = await db.execute({
    sql: "SELECT id, owner_user_id FROM exercises WHERE name_norm = 'prensa horizontal' AND is_base = 0",
    args: [],
  });
  if (r.rows.length !== 2) return `${r.rows.length} filas, esperaba 2 (una por usuario)`;
  const duenos = new Set(r.rows.map((x) => x.owner_user_id));
  if (duenos.size !== 2) return "las dos quedaron del mismo dueno";
  return true;
});

await check("cada uno ve el base y lo suyo, nunca lo del otro", async () => {
  const deAna = await cat.listCatalog(ana.id);
  const propios = deAna.filter((c) => !c.base);
  if (propios.length !== 1) return `Ana ve ${propios.length} ejercicios propios`;
  if (!propios[0].id.startsWith(`${ana.id}~`)) return `id inesperado: ${propios[0].id}`;
  if (deAna.filter((c) => c.base).length !== CATALOGO_BASE.length) return "no ve el catalogo base completo";
  return true;
});

const PROGRAMA = {
  id: "p-cat",
  name: "Prueba",
  weeks: 4,
  hasDeload: false,
  sessions: [{ id: "A", name: "Torso" }],
  exercises: [
    { id: "e1", session: "A", order: 1, name: "Prensa horizontal", group: "Cuádriceps", sets: 3, repsMin: 8, repsMax: 10, unit: "reps", exerciseId: propioAna.id },
    { id: "e2", session: "A", order: 2, name: "Press Plano (barra)", group: "Pecho", sets: 3, repsMin: 8, repsMax: 10, unit: "reps", exerciseId: CATALOGO_BASE[0].id },
  ],
};

await check("un programa sube con la referencia al catalogo", async () => {
  const r = await pushProgramForUser(ana.id, PROGRAMA);
  if (!r.ok) return `no subio: ${r.motivo}`;
  const filas = await db.execute("SELECT id, exercise_id FROM program_exercises ORDER BY order_idx");
  if (filas.rows.some((f) => f.exercise_id === null)) {
    return "quedo un ejercicio sin referencia al catalogo";
  }
  return true;
});

await check("la referencia vuelve del pull con el id que conoce el cliente", async () => {
  const { programs, catalog } = await pullForUser(ana.id);
  const p = programs.find((x) => x.id === "p-cat");
  if (!p) return "no volvio el programa";

  const propio = p.exercises.find((e) => e.name === "Prensa horizontal");
  if (propio.exerciseId !== propioAna.id) {
    return `volvio ${propio.exerciseId}, esperaba ${propioAna.id} (sin el prefijo del usuario)`;
  }
  const base = p.exercises.find((e) => e.name === "Press Plano (barra)");
  if (base.exerciseId !== CATALOGO_BASE[0].id) return `el id base volvio distinto: ${base.exerciseId}`;

  // Y el ejercicio esta en el catalogo, no solo dentro del programa: es lo que
  // permite reusarlo en otra sesion desde el selector.
  if (!catalog.some((c) => c.id === propioAna.id)) return "el ejercicio propio no volvio en el catalogo";
  return true;
});

await check("un dispositivo nuevo recibe el catalogo entero, no solo lo usado", async () => {
  // Un ejercicio cargado y todavia no usado en ningun programa: era justo lo
  // unico que no sobrevivia al cambio de dispositivo.
  const suelto = { id: "ex-remo-gironda-4f4f", name: "Remo Gironda", group: "Espalda", unit: "reps", base: false };
  await pushCatalogForUser(ana.id, [suelto]);

  const { catalog } = await pullForUser(ana.id);
  if (!catalog.some((c) => c.id === suelto.id)) return "el ejercicio suelto no viajo";

  // El dispositivo nuevo arranca solo con el base y fusiona lo que baja.
  const fusionado = mergeCatalog(CATALOGO_BASE, catalog);
  if (!fusionado.some((c) => c.id === suelto.id)) return "el merge del cliente lo descarto";
  if (fusionado.filter((c) => c.name === "Remo Gironda").length !== 1) return "quedo duplicado";
  return true;
});

await check("corregir el nombre de un ejercicio se propaga", async () => {
  await pushCatalogForUser(ana.id, [{ ...propioAna, name: "Prensa horizontal (máquina nueva)" }]);
  const { catalog } = await pullForUser(ana.id);
  const c = catalog.find((x) => x.id === propioAna.id);
  if (c.name !== "Prensa horizontal (máquina nueva)") return `quedo "${c.name}"`;
  return true;
});

await check("nadie puede reescribir el ejercicio de otro", async () => {
  // `listCatalog` devuelve los ids DE LA BASE, que van prefijados; los del
  // cliente salen recien de `unscopeCatalog`, en el pull.
  const idEnLaBase = `${ana.id}~${propioAna.id}`;
  const deAna = () => cat.listCatalog(ana.id).then((cs) => cs.find((c) => c.id === idEnLaBase));

  const antes = (await deAna())?.name;
  if (!antes) return "no encontre el ejercicio de Ana en la base";

  // Beto manda el id de Ana ya prefijado: lo peor que podria llegar.
  await cat.saveCatalog(beto.id, [{ id: idEnLaBase, name: "SECUESTRADO", base: false }]);

  const despues = (await deAna())?.name;
  if (despues !== antes) return `le cambiaron el ejercicio a Ana: "${despues}"`;
  return true;
});

await check("el catalogo base es de solo lectura", async () => {
  await pushCatalogForUser(ana.id, [{ ...CATALOGO_BASE[0], name: "PISADO" }]);
  const r = await db.execute({ sql: "SELECT name FROM exercises WHERE id = ?", args: [CATALOGO_BASE[0].id] });
  if (r.rows[0].name !== CATALOGO_BASE[0].name) return `el base quedo como "${r.rows[0].name}"`;
  return true;
});


/* ============ una referencia huerfana rompe el push del programa ENTERO ============ */

await check("un exerciseId inexistente hace fallar el INSERT del programa entero", async () => {
  // La FK es real y esto es lo que pasaba en produccion: 16 de 36 ejercicios
  // apuntaban a entradas que no estaban, y el programa no subia NUNCA — el
  // push se reintenta en cada sincronizacion y falla siempre igual.
  const p = {
    id: 'p-huerfano', name: 'Con referencia rota', weeks: 4, hasDeload: true,
    sessions: [{ id: 'A', name: 'A' }],
    exercises: [
      { id: 'x1', session: 'A', order: 1, name: 'Press plano', sets: 3, exerciseId: CATALOGO_BASE[0].id },
      { id: 'x2', session: 'A', order: 2, name: 'Fantasma', sets: 3, exerciseId: 'ex-no-existe-en-ningun-lado' },
    ],
  };
  let exploto = false;
  try { await pushProgramForUser(ana.id, p); } catch { exploto = true; }
  return exploto ? true : 'el servidor lo acepto: la FK no esta protegiendo nada';
});

await check('saneado antes de subir, el mismo programa entra', async () => {
  const { sinReferenciasHuerfanas } = await import("../lib/catalog.js");
  // El catalogo base alcanza: lo que importa es que NO contenga el id fantasma.
  const catalogo = CATALOGO_BASE;
  const p = {
    id: 'p-saneado', name: 'Saneado', weeks: 4, hasDeload: true,
    sessions: [{ id: 'A', name: 'A' }],
    exercises: [
      { id: 'y1', session: 'A', order: 1, name: 'Press plano', sets: 3, exerciseId: CATALOGO_BASE[0].id },
      { id: 'y2', session: 'A', order: 2, name: 'Fantasma', sets: 3, exerciseId: 'ex-no-existe-en-ningun-lado' },
    ],
  };
  const { programs, sueltas } = sinReferenciasHuerfanas([p], catalogo);
  if (sueltas !== 1) return `solto ${sueltas} referencias, esperaba 1`;
  await pushProgramForUser(ana.id, programs[0]);
  const { programs: remotos } = await pullForUser(ana.id);
  const vuelto = remotos.find((x) => x.name === "Saneado");
  if (!vuelto) return "el programa no llego al servidor";
  // El ejercicio NO se pierde: lo unico que se solto es la referencia, y el
  // nombre viaja denormalizado al lado.
  if (vuelto.exercises.length !== 2) return `volvio con ${vuelto.exercises.length} ejercicios, esperaba 2`;
  const conRef = vuelto.exercises.filter((e) => e.exerciseId);
  return conRef.length === 1 ? true : `quedaron ${conRef.length} referencias, esperaba 1`;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  catalogo: identidad del ejercicio estable entre dispositivos");
