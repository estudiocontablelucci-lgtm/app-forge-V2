/**
 * Verifica las medidas corporales contra los NUMEROS REALES de la planilla.
 *
 *   node scripts/verify-medidas.mjs
 *
 * Los valores esperados salen de la hoja "Medidas corporales" del archivo que
 * la app viene a reemplazar. Es la unica forma de saber que las formulas son
 * las mismas y no una reconstruccion de memoria que se le parece.
 */
import { rmSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = resolve(root, "db/verify-medidas.db");
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

const M = await import("../lib/medidas.js");
const users = await import("../lib/repo/users.js");
const repo = await import("../lib/repo/medidas.js");

const fallas = [];
const check = async (label, fn) => {
  try {
    const r = await fn();
    if (r !== true) fallas.push(`${label}: ${r}`);
    else console.log(`  ok  ${label}`);
  } catch (e) { fallas.push(`${label}: excepcion ${e.message}`); }
};

/* Fila real de la planilla: baseline del Ciclo 2. */
const TOMA1 = {
  altura: 174, peso: 73.15, grasaPct: 12.6, masaGrasa: 9.2, masaMuscular: 35.4, agua: 46.9, bmr: 1749,
  cuello: 39.5, pecho: 104, cintura: 83, cadera: 96,
  brazoDRelajado: 36, brazoDContraido: 37.3, brazoIRelajado: 34.2, brazoIContraido: 35.5,
  antebrazoD: 31, antebrazoI: 29.5, musloD: 54, musloI: 54,
  pantorrillaD: 36, pantorrillaI: 36.5, muneca: 17.7, tobillo: 21.5,
  hombrosBiacromial: 52, hombrosCircunf: 124,
};

const TOMA2 = {
  altura: 174, peso: 73.9, grasaPct: 15.3, masaGrasa: 11.3, masaMuscular: 34.4, agua: 45.9, bmr: 1721,
  cuello: 39.5, pecho: 105, cintura: 83, cadera: 96.5,
  brazoDRelajado: 36.5, brazoDContraido: 37.5, brazoIRelajado: 34.5, brazoIContraido: 35.8,
  antebrazoD: 31, antebrazoI: 29.5, musloD: 57, musloI: 57,
  pantorrillaD: 36.5, pantorrillaI: 37.5, muneca: 17.7, tobillo: 21.5,
  hombrosBiacromial: 52, hombrosCircunf: 124,
};

console.log("\nformulas contra la planilla");

await check("la masa grasa medida gana sobre la calculada", async () => {
  // La bascula la da; calcularla del % da 63.93 y la planilla dice 63.95.
  const conMedida = M.derivadas(TOMA1);
  const sinMedida = M.derivadas({ ...TOMA1, masaGrasa: undefined });
  if (conMedida.masaMagra === sinMedida.masaMagra) return "ignoro el valor de la bascula";
  if (sinMedida.masaGrasa === null) return "sin el dato de bascula deberia calcularlo del %";
  return true;
});

await check("masa grasa y masa magra", async () => {
  const d = M.derivadas(TOMA1);
  if (d.masaGrasa !== 9.2) return `masa grasa ${d.masaGrasa}, la planilla dice 9.2`;
  if (Math.abs(d.masaMagra - 64) > 0.06) return `masa magra ${d.masaMagra}, la planilla dice 63.95`;
  return true;
});

await check("IMC", async () => {
  const d = M.derivadas(TOMA1);
  if (Math.abs(d.imc - 24.16) > 0.01) return `${d.imc}, la planilla dice 24.16`;
  return true;
});

await check("FFMI normalizado (no el crudo)", async () => {
  // El crudo daria 21.12. La planilla dice 21.49: usa la correccion a 1.80 m.
  const d = M.derivadas(TOMA1);
  if (Math.abs(d.ffmi - 21.49) > 0.02) return `${d.ffmi}, la planilla dice 21.49`;
  const d2 = M.derivadas(TOMA2);
  if (Math.abs(d2.ffmi - 21.04) > 0.02) return `segunda toma ${d2.ffmi}, la planilla dice 21.04`;
  return true;
});

await check("% de agua corporal", async () => {
  const d = M.derivadas(TOMA1);
  if (Math.abs(d.aguaPct - 64.1) > 0.1) return `${d.aguaPct}, la planilla dice 64.11`;
  return true;
});

await check("cintura/altura y cintura/cadera", async () => {
  const d = M.derivadas(TOMA1);
  if (Math.abs(d.cinturaAltura - 0.48) > 0.01) return `cintura/altura ${d.cinturaAltura}`;
  if (Math.abs(d.cinturaCadera - 0.86) > 0.01) return `cintura/cadera ${d.cinturaCadera}`;
  return true;
});

console.log("\nasimetrias");

await check("la asimetria del brazo da el -4.8% que cita el programa", async () => {
  // Es el numero que motiva el protocolo ASIM-IZQ en el SEED.
  const [brazo] = M.asimetrias(TOMA1);
  if (Math.abs(brazo.pct + 4.8) > 0.1) return `dio ${brazo.pct}%, esperaba -4.8%`;
  if (!brazo.alerta) return "no la marco como alerta";
  if (brazo.lado !== "izquierdo") return `dijo lado ${brazo.lado}`;
  return true;
});

await check("una diferencia chica no dispara alerta", async () => {
  const a = M.asimetrias({ musloD: 57, musloI: 56.5 });
  const muslo = a.find((x) => x.id === "muslo");
  if (muslo.alerta) return `alerto por ${muslo.pct}%, umbral ${M.UMBRAL_ASIMETRIA}%`;
  return true;
});

await check("lados iguales dan 0 y no alertan", async () => {
  const a = M.asimetrias({ musloD: 57, musloI: 57 });
  if (a[0].pct !== 0 || a[0].alerta) return JSON.stringify(a[0]);
  return true;
});

console.log("\nproporciones y ratios");

await check("los objetivos salen de las reglas de la planilla", async () => {
  const p = M.proporciones(TOMA2);
  const pecho = p.find((x) => x.id === "pecho");
  if (pecho.target !== 108) return `pecho target ${pecho.target}, la planilla dice 108 (cintura + 25)`;
  const brazoD = p.find((x) => x.id === "brazoDContraido");
  if (brazoD.target !== 39.5) return `brazo target ${brazoD.target}, deberia ser el cuello (39.5)`;
  if (brazoD.delta !== -2) return `delta ${brazoD.delta}, la planilla dice -2`;
  const antD = p.find((x) => x.id === "antebrazoD");
  if (Math.abs(antD.target - 30.5) > 0.1) return `antebrazo target ${antD.target}, la planilla dice 30.5`;
  const musloD = p.find((x) => x.id === "musloD");
  if (Math.abs(musloD.target - 55.7) > 0.1) return `muslo target ${musloD.target}, la planilla dice 55.7`;
  return true;
});

await check("los ratios coinciden y saben de que lado esta bien", async () => {
  const r = M.ratios(TOMA2);
  const pc = r.find((x) => x.id === "pechoCintura");
  if (Math.abs(pc.actual - 1.27) > 0.01) return `pecho/cintura ${pc.actual}, la planilla dice 1.27`;
  if (pc.ok) return "1.27 no llega a 1.30 y lo dio por bueno";

  const ca = r.find((x) => x.id === "cinturaAltura");
  if (!ca.ok) return `cintura/altura ${ca.actual} deberia estar bien (< 0.50)`;

  const pb = r.find((x) => x.id === "pantorrillaBrazo");
  if (Math.abs(pb.actual - 0.97) > 0.01) return `pantorrilla/brazo ${pb.actual}, la planilla dice 0.97`;
  return true;
});

await check("un dato faltante no inventa un ratio", async () => {
  const r = M.ratios({ cintura: 83 });
  if (r.some((x) => x.id === "pechoCintura" && x.actual !== null)) return "calculo pecho/cintura sin pecho";
  const d = M.derivadas({ peso: 73 });
  if (d.imc !== null) return "calculo IMC sin altura";
  return true;
});

console.log("\ncomparacion entre tomas");

await check("el delta contra la anterior", async () => {
  const d = M.contra(TOMA2, TOMA1);
  if (d.peso !== 0.8) return `Δ peso ${d.peso}, esperaba 0.8 (73.9 - 73.15 = 0.75, redondeado)`;
  if (d.musloD !== 3) return `Δ muslo ${d.musloD}`;
  if (Math.abs(d.ffmi + 0.45) > 0.02) return `Δ FFMI ${d.ffmi}, la planilla dice -0.4459`;
  if (d.cintura !== 0) return `Δ cintura ${d.cintura}, la planilla dice 0`;
  return true;
});

await check("sin anterior no hay delta", async () => {
  if (Object.keys(M.contra(TOMA1, null)).length) return "invento un delta sin con que comparar";
  return true;
});

console.log("\npersistencia");

const ana = await users.findOrCreate({ email: "ana@med.test", displayName: "Ana" });
const beto = await users.findOrCreate({ email: "beto@med.test", displayName: "Beto" });

await check("se guarda y se lee una toma", async () => {
  await repo.guardar({ athleteId: ana.id, fecha: "2026-05-01", valores: TOMA1 });
  const todas = await repo.listar(ana.id);
  if (todas.length !== 1) return `${todas.length} tomas`;
  if (todas[0].valores.peso !== 73.15) return "no volvio el peso";
  if (todas[0].fecha !== "2026-05-01") return `fecha ${todas[0].fecha}`;
  return true;
});

await check("dos tomas del mismo dia se pisan, no se duplican", async () => {
  await repo.guardar({ athleteId: ana.id, fecha: "2026-05-01", valores: { ...TOMA1, peso: 74 } });
  const todas = await repo.listar(ana.id);
  if (todas.length !== 1) return `quedaron ${todas.length} tomas para el mismo dia`;
  if (todas[0].valores.peso !== 74) return "no se actualizo";
  return true;
});

await check("vuelven de la mas reciente a la mas vieja", async () => {
  await repo.guardar({ athleteId: ana.id, fecha: "2026-06-08", valores: TOMA2 });
  const todas = await repo.listar(ana.id);
  if (todas[0].fecha !== "2026-06-08") return `la primera es ${todas[0].fecha}`;
  return true;
});

await check("cada uno ve solo lo suyo", async () => {
  await repo.guardar({ athleteId: beto.id, fecha: "2026-06-08", valores: { peso: 90 } });
  const deAna = await repo.listar(ana.id);
  if (deAna.some((t) => t.valores.peso === 90)) return "Ana ve las medidas de Beto";
  return true;
});

await check("borrar una toma no toca las otras", async () => {
  const todas = await repo.listar(ana.id);
  const ok = await repo.borrar({ athleteId: ana.id, id: todas[0].id });
  if (!ok) return "no borro";
  const quedan = await repo.listar(ana.id);
  if (quedan.length !== 1) return `quedaron ${quedan.length}`;
  return true;
});

await check("nadie puede borrar la medida de otro", async () => {
  const deBeto = await repo.listar(beto.id);
  const ok = await repo.borrar({ athleteId: ana.id, id: deBeto[0].id });
  if (ok) return "Ana borro una medida de Beto";
  if (!(await repo.listar(beto.id)).length) return "igual desaparecio";
  return true;
});

if (fallas.length) {
  console.error(`\nFALLO  ${fallas.length} verificacion(es):`);
  for (const f of fallas) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nOK  medidas: formulas iguales a las de la planilla, y aisladas por atleta");
