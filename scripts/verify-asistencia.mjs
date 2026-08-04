/**
 * Verifica la asistencia contra los NUMEROS REALES de la planilla.
 *
 *   node scripts/verify-asistencia.mjs
 *
 * Los 24 meses y los dos promedios salen de la hoja "Asistencia" del archivo
 * que la app viene a reemplazar. Si el promedio no da igual, la app y la
 * planilla estan contando cosas distintas y no se pueden comparar.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-asistencia.db");
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

const A = await import("../lib/asistencia.js");
const users = await import("../lib/repo/users.js");
const repo = await import("../lib/repo/asistencia.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

/* Los 24 meses de la planilla, tal cual. */
const PLANILLA = {
  "2024-08": 5, "2024-09": 13, "2024-10": 12, "2024-11": 12, "2024-12": 10,
  "2025-01": 6, "2025-02": 10, "2025-03": 3, "2025-04": 6, "2025-05": 3, "2025-06": 6,
  "2025-07": 12, "2025-08": 12, "2025-09": 11, "2025-10": 10, "2025-11": 12, "2025-12": 9,
  "2026-01": 12, "2026-02": 9, "2026-03": 6, "2026-04": 8, "2026-05": 10, "2026-06": 9, "2026-07": 9,
};
// Se resume parada en agosto de 2026: los 24 meses estan cerrados.
const HOY = new Date("2026-08-15T12:00:00");

console.log("\ncontra la planilla");

await check("el total de dias", async () => {
  const r = A.resumen(PLANILLA, { hoy: HOY });
  if (r.total !== 215) return `${r.total}, la planilla dice 215`;
  return true;
});

await check("el promedio historico", async () => {
  const r = A.resumen(PLANILLA, { hoy: HOY });
  if (Math.abs(r.promedio - 8.96) > 0.01) return `${r.promedio}, la planilla dice 8.96`;
  return true;
});

await check("el promedio desde 07/2025", async () => {
  // El segundo promedio de la planilla: el que muestra que algo cambio.
  const r = A.resumen(PLANILLA, { desde: "2025-07", hoy: HOY });
  if (Math.abs(r.promedioDesde - 9.92) > 0.01) return `${r.promedioDesde}, la planilla dice 9.92`;
  if (r.promedioDesde <= r.promedio) return "el promedio reciente deberia ser MAYOR que el historico";
  return true;
});

await check("el mejor mes", async () => {
  const r = A.resumen(PLANILLA, { hoy: HOY });
  if (r.mejor.dias !== 13 || r.mejor.mes !== "2024-09") return JSON.stringify(r.mejor);
  return true;
});

console.log("\ncalculo desde el historial");

await check("cuenta DIAS, no sesiones", async () => {
  // Dos entrenamientos el mismo martes son un dia de gimnasio.
  const m = A.mesesDesdeHistorial([
    { date: new Date("2026-08-04T10:00:00").getTime() },
    { date: new Date("2026-08-04T19:00:00").getTime() },
    { date: new Date("2026-08-06T10:00:00").getTime() },
  ]);
  if (m["2026-08"] !== 2) return `conto ${m["2026-08"]} dias, esperaba 2`;
  return true;
});

await check("agrupa por mes calendario", async () => {
  const m = A.mesesDesdeHistorial([
    { date: new Date("2026-07-31T20:00:00").getTime() },
    { date: new Date("2026-08-01T09:00:00").getTime() },
  ]);
  if (m["2026-07"] !== 1 || m["2026-08"] !== 1) return JSON.stringify(m);
  return true;
});

await check("una fecha rota no rompe el conteo", async () => {
  const m = A.mesesDesdeHistorial([{ date: null }, { date: "no es fecha" }, { date: new Date("2026-08-04").getTime() }]);
  if (Object.keys(m).length !== 1) return JSON.stringify(m);
  return true;
});

console.log("\ncombinar las dos fuentes");

await check("lo cargado a mano le gana a lo calculado", async () => {
  // El mes en que se empezo a usar la app: 3 sesiones registradas, 9 dias reales.
  const c = A.combinar({ "2026-07": 3 }, { "2026-07": 9 });
  if (c["2026-07"] !== 9) return `quedo en ${c["2026-07"]}`;
  return true;
});

await check("corregir un mes HACIA ABAJO tambien vale", async () => {
  // Si se tomara el maximo, una correccion a la baja se ignoraria para siempre.
  const c = A.combinar({ "2026-07": 9 }, { "2026-07": 6 });
  if (c["2026-07"] !== 6) return `quedo en ${c["2026-07"]}: esta tomando el maximo`;
  return true;
});

await check("los meses que solo estan de un lado sobreviven", async () => {
  const c = A.combinar({ "2026-07": 3 }, { "2024-08": 5 });
  if (c["2026-07"] !== 3 || c["2024-08"] !== 5) return JSON.stringify(c);
  return true;
});

console.log("\nserie y promedios");

await check("un mes sin entrenar cuenta como CERO, no como hueco", async () => {
  // Saltearlo haria que el promedio suba justo por los meses en que no se fue.
  const r = A.resumen({ "2026-01": 10, "2026-03": 8 }, { hoy: new Date("2026-05-01") });
  if (r.serie.length !== 3) return `${r.serie.length} meses en la serie, esperaba 3`;
  if (r.serie[1].dias !== 0) return "febrero no quedo en cero";
  if (Math.abs(r.promedio - 6) > 0.01) return `promedio ${r.promedio}, esperaba 6 (18/3)`;
  return true;
});

await check("el mes en curso NO entra en el promedio", async () => {
  // Esta a mitad de camino: incluirlo tira el promedio abajo sin motivo.
  const r = A.resumen({ "2026-06": 10, "2026-07": 10, "2026-08": 2 }, { hoy: new Date("2026-08-10") });
  if (r.promedio !== 10) return `promedio ${r.promedio}, esperaba 10 (el mes en curso no cuenta)`;
  if (r.mesActual?.dias !== 2) return "pero si tiene que poder mostrarlo aparte";
  if (r.total !== 22) return `el total si lo incluye: ${r.total}`;
  return true;
});

await check("la racha son meses seguidos con al menos un dia", async () => {
  const r = A.resumen({ "2026-03": 5, "2026-04": 0, "2026-05": 8, "2026-06": 9, "2026-07": 7 },
    { hoy: new Date("2026-08-10") });
  if (r.racha !== 3) return `racha ${r.racha}, esperaba 3 (may, jun, jul)`;
  return true;
});

await check("sin datos no inventa promedios", async () => {
  const r = A.resumen({}, { hoy: HOY });
  if (r.promedio !== null || r.serie.length) return JSON.stringify(r);
  return true;
});

await check("la etiqueta del mes se lee", async () => {
  if (A.etiquetaMes("2026-08") !== "ago 26") return A.etiquetaMes("2026-08");
  return true;
});

console.log("\npersistencia");

const ana = await users.findOrCreate({ email: "ana@asis.test", displayName: "Ana" });
const beto = await users.findOrCreate({ email: "beto@asis.test", displayName: "Beto" });

await check("se guardan y se leen los meses", async () => {
  for (const [mes, dias] of Object.entries(PLANILLA)) {
    const r = await repo.guardar({ athleteId: ana.id, mes, dias, origen: "import" });
    if (!r.ok) return `${mes}: ${r.motivo}`;
  }
  const m = await repo.mapa(ana.id);
  if (Object.keys(m).length !== 24) return `${Object.keys(m).length} meses`;
  if (m["2024-09"] !== 13) return "no volvio el mejor mes";
  return true;
});

await check("el resumen desde la base da los mismos numeros que la planilla", async () => {
  const r = A.resumen(await repo.mapa(ana.id), { desde: "2025-07", hoy: HOY });
  if (r.total !== 215) return `total ${r.total}`;
  if (Math.abs(r.promedio - 8.96) > 0.01) return `promedio ${r.promedio}`;
  if (Math.abs(r.promedioDesde - 9.92) > 0.01) return `promedio desde ${r.promedioDesde}`;
  return true;
});

await check("corregir un mes lo pisa, no lo duplica", async () => {
  await repo.guardar({ athleteId: ana.id, mes: "2024-08", dias: 7 });
  const m = await repo.mapa(ana.id);
  if (Object.keys(m).length !== 24) return `quedaron ${Object.keys(m).length} meses`;
  if (m["2024-08"] !== 7) return `quedo en ${m["2024-08"]}`;
  return true;
});

await check("no acepta un mes ni una cantidad absurda", async () => {
  if ((await repo.guardar({ athleteId: ana.id, mes: "agosto", dias: 5 })).ok) return "acepto un mes invalido";
  if ((await repo.guardar({ athleteId: ana.id, mes: "2026-09", dias: 40 })).ok) return "acepto 40 dias en un mes";
  if ((await repo.guardar({ athleteId: ana.id, mes: "2026-09", dias: -2 })).ok) return "acepto dias negativos";
  return true;
});

await check("cada uno ve solo lo suyo", async () => {
  await repo.guardar({ athleteId: beto.id, mes: "2024-08", dias: 20 });
  const m = await repo.mapa(ana.id);
  if (m["2024-08"] !== 7) return "se mezclaron los meses de los dos";
  return true;
});

await check("borrar un mes lo devuelve al calculo automatico", async () => {
  await repo.borrar({ athleteId: ana.id, mes: "2024-08" });
  const m = await repo.mapa(ana.id);
  if ("2024-08" in m) return "sigue estando";
  if (Object.keys(m).length !== 23) return `quedaron ${Object.keys(m).length}`;
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  asistencia: mismos numeros que la planilla, y el mes en curso no ensucia el promedio");
